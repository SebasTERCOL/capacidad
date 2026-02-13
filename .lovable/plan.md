

# Plan: Sistema de Scheduling de Produccion - 6 Fases

## Resumen Ejecutivo

Transformar el sistema actual de "cuanta capacidad tengo" a "cuando termino esta orden", mediante la construccion progresiva de un motor de scheduling basado en DAG (Directed Acyclic Graph) con precedencias de procesos.

## Estado Actual

- **ProductionProjectionV2.tsx**: 2,940 lineas de logica de calculo en el cliente (navegador)
- **22 procesos** configurados en la tabla `processes`
- **9,247 registros** en `machines_processes` vinculando referencias a maquinas/procesos
- **Sin dependencias formales** entre procesos (el orden es implicito por los IDs)
- Procesos con orden natural: Corte(10) -> Punzonado(20) -> Troquelado(30) -> Doblez(40) -> Soldadura(50) -> Mig(60) -> Lavado(70) -> Pintura(80) -> Ensamble(90) -> Empaque(100)

---

## FASE 1 - Formalizar Dependencias

**Objetivo**: Crear la estructura de datos para las precedencias sin modificar nada existente.

### Cambios en Base de Datos

1. Crear tabla `process_dependencies`:

```text
process_dependencies
├── id (SERIAL PK)
├── process_id (FK -> processes.id)  -- El proceso que depende
├── depends_on_process_id (FK -> processes.id)  -- Del cual depende
└── UNIQUE(process_id, depends_on_process_id)
```

2. Agregar columna `is_schedulable` a `processes` para excluir procesos que no participan del scheduling (Reclasificacion, Reproceso, RecepcionPL, RecepcionAlm, Pulido, RoscadoConectores).

3. Poblar dependencias reales. Ejemplo:
   - Punzonado(20) depende de Corte(10)
   - Doblez(40) depende de Punzonado(20) o Troquelado(30)
   - Lavado(70) depende de Soldadura(50) y Mig(60)
   - Pintura(80) depende de Lavado(70) y Horno(2)
   - Ensamble(90) depende de Pintura(80)
   - Empaque(100) depende de Ensamble(90)

### Archivos afectados
- Solo migraciones SQL (nuevas tablas)
- Ningun archivo frontend se modifica

---

## FASE 2 - Motor Basico de Scheduling (RPC)

**Objetivo**: Crear funcion PostgreSQL que calcule el schedule usando CPM (Critical Path Method).

### Funcion RPC: `calculate_schedule`

Parametros de entrada:
- `p_references TEXT[]` -- Array de referencias
- `p_quantities NUMERIC[]` -- Cantidades correspondientes

Retorna tabla con:
- referencia, proceso, maquina
- ES (Earliest Start), EF (Earliest Finish)
- LS (Latest Start), LF (Latest Finish)
- Slack (holgura)
- is_critical (si esta en ruta critica)
- makespan total

### Logica interna (todo en PostgreSQL):

```text
Paso 1: Expandir BOM recursivo (CTE)
   WITH RECURSIVE bom_tree AS (
     SELECT product_id, component_id, amount, 1 as level
     FROM bom WHERE product_id = ANY(p_references)
     UNION ALL
     SELECT b.product_id, b.component_id, b.amount * bt.amount, bt.level + 1
     FROM bom b JOIN bom_tree bt ON b.product_id = bt.component_id
     WHERE bt.level < 10
   )

Paso 2: Obtener procesos por referencia
   JOIN machines_processes + processes
   WHERE is_schedulable = true

Paso 3: Construir nodos del DAG
   Cada nodo = (referencia, proceso, tiempo)
   tiempo = cantidad * SAM (con conversion de unidades)

Paso 4: Forward Pass (ES/EF)
   ES[nodo] = MAX(EF[predecesores])
   EF[nodo] = ES[nodo] + duracion

Paso 5: Backward Pass (LS/LF)
   LF[nodo] = MIN(LS[sucesores])
   LS[nodo] = LF[nodo] - duracion

Paso 6: Ruta critica
   Slack = LS - ES
   is_critical = (Slack == 0)
```

### Primera version SIN:
- Restriccion de maquina (capacidad infinita)
- Validacion de capacidad mensual
- Solo precedencias + tiempos

### Archivos afectados
- Nueva migracion SQL con la funcion RPC
- Archivo de test temporal en frontend para validar resultados

---

## FASE 3 - Integrar Capacidad Mensual

**Objetivo**: Extender el motor para validar contra disponibilidad real.

### Funcion RPC: `calculate_schedule_with_capacity`

Parametros adicionales:
- `p_month INTEGER`
- `p_year INTEGER`

### Logica adicional:

```text
1. Consultar disponibilidad mensual:
   - Dias habiles (excluyendo festivos colombianos)
   - Horas por turno * operarios por proceso
   - Minutos disponibles = dias * turnos * horas * operarios

2. Para cada proceso:
   - Si tiempo_requerido <= minutos_disponibles: cabe en el mes
   - Si no: calcular overflow al siguiente periodo
   - Retornar fecha estimada de finalizacion

3. Ajustar ES/EF con restricciones de calendario:
   - ES no puede ser antes del inicio del mes
   - EF considera dias no laborables
```

### Consideracion especial
- Reutilizar la logica de festivos colombianos (actualmente en `src/lib/colombianHolidays.ts`) moviendola a una tabla o funcion SQL.

### Archivos afectados
- Migracion SQL (funcion extendida + tabla de festivos opcional)
- Sin cambios significativos en frontend aun

---

## FASE 4 - Restriccion por Maquina (RCPSP)

**Objetivo**: Resolver conflictos cuando multiples productos compiten por la misma maquina.

### Algoritmo: List Scheduling con heuristica Earliest Finish

```text
1. Ordenar nodos por ES (Forward Pass)
2. Para cada nodo en orden:
   a. Verificar si la maquina esta libre
   b. Si esta libre: asignar
   c. Si esta ocupada: esperar hasta que se libere
   d. Actualizar ES/EF del nodo
3. Recalcular ruta critica con tiempos ajustados
```

### Datos necesarios (ya existen):
- `machines.status` (ENCENDIDO/APAGADO/MANTENIMIENTO)
- `machines_processes` (que maquinas pueden hacer que proceso)
- Multiples maquinas por proceso permiten paralelismo

### Archivos afectados
- Migracion SQL (extension de la funcion RPC)
- Posiblemente una funcion auxiliar para el algoritmo de asignacion

---

## FASE 5 - Refactor Frontend

**Objetivo**: Reducir ProductionProjectionV2 de ~3,000 lineas a ~500, delegando calculo al backend.

### Nueva estructura de componentes:

```text
src/components/ProductionCapacity/
├── ScheduleConfig.tsx        -- Configuracion de parametros (mes, año, turnos)
├── ScheduleResults.tsx       -- Visualizacion de resultados
│   ├── GanttChart.tsx        -- Diagrama Gantt (usando recharts)
│   ├── CriticalPathView.tsx  -- Ruta critica resaltada
│   ├── ProcessTimeline.tsx   -- Tabla ES/EF/Slack
│   └── MakespanSummary.tsx   -- Resumen de makespan
├── ScheduleEngine.ts         -- Llamada RPC + transformacion de datos
└── ProductionProjectionV2.tsx -- Se mantiene como wrapper/legacy
```

### Flujo simplificado:

```text
1. Usuario configura parametros en ScheduleConfig
2. ScheduleEngine llama:
   const { data } = await supabase.rpc('calculate_schedule_with_capacity', {
     p_references: [...],
     p_quantities: [...],
     p_month: 7,
     p_year: 2025
   })
3. ScheduleResults renderiza los resultados
4. GanttChart muestra timeline visual
```

### Dependencia existente que se reutiliza:
- `recharts` (ya instalado) para el diagrama Gantt
- Componentes UI de shadcn/ui ya disponibles

### Archivos afectados
- Nuevos: `ScheduleConfig.tsx`, `ScheduleResults.tsx`, `GanttChart.tsx`, `CriticalPathView.tsx`, `ProcessTimeline.tsx`, `MakespanSummary.tsx`, `ScheduleEngine.ts`
- Modificado: `ProductionProjectionV2.tsx` (simplificado drasticamente)
- Modificado: `Index.tsx` (integrar nuevos componentes en el flujo de pasos)

---

## FASE 6 - Simulacion What-If

**Objetivo**: Permitir al usuario simular cambios y ver impacto en la ruta critica.

### Funcionalidades:
- Agregar/quitar operario a un proceso
- Encender/apagar maquina
- Cambiar turno (7h, 8h, 10h)
- Modificar eficiencia porcentual
- Agregar horas extra a proceso especifico

### Implementacion:
- Los parametros de simulacion se pasan como override a la RPC
- Se muestra comparacion lado a lado: plan actual vs simulado
- Delta de makespan visible inmediatamente

### Archivos afectados
- Nuevo: `WhatIfSimulator.tsx`
- Extension de la funcion RPC para aceptar overrides

---

## Orden de Ejecucion Recomendado

| Paso | Fase | Descripcion | Riesgo |
|------|------|-------------|--------|
| 1 | F1 | Crear `process_dependencies` + poblar | Ninguno |
| 2 | F1 | Agregar `is_schedulable` a `processes` | Ninguno |
| 3 | F2 | Crear RPC basica `calculate_schedule` | Bajo |
| 4 | F2 | Validar con 1 referencia (BN06) | Bajo |
| 5 | F3 | Extender RPC con capacidad mensual | Medio |
| 6 | F5 | Refactor frontend (parcial) | Medio |
| 7 | F4 | Agregar restriccion por maquina | Alto |
| 8 | F6 | Simulacion What-If | Medio |

## Reglas de Seguridad

- NO se tocan las tablas/vistas de OEE
- NO se modifica el calculo de horas disponibles existente
- NO se eliminan tablas existentes
- Solo se agregan capas nuevas sobre lo existente
- `ProductionProjectionV2.tsx` se mantiene funcional durante toda la transicion

