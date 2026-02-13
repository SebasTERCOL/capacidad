

## Diagnóstico: Origen de los 2,382.9 Días

### Hallazgo Confirmado

Se verificó directamente contra la base de datos: el valor de **2,382.9 días** proviene de la referencia **TSCE125** en el proceso **Punzonado** (ID 20).

Cadena de cálculo:
1. Las referencias del CSV se expanden recursivamente por la tabla BOM
2. Múltiples referencias padre contienen a TSCE125 como componente
3. Después de la expansión BOM, la cantidad agregada de TSCE125 llega a **~53,293 unidades**
4. El SAM registrado es **21 min/unidad** (`min_per_unit`)
5. Duración = 53,293 x 21 = **1,119,153 minutos = 2,382 días laborales**

### Comparación con otros procesos

| Referencia | Proceso | SAM | Unidad |
|---|---|---|---|
| TSCE125 | Punzonado | **21.0** | min_per_unit |
| TSCE125GV | Punzonado | **21.0** | min_per_unit |
| CMB.T-CT2020.V1 | Punzonado | 20.067 | min_per_unit |
| CMB.TAPA4P.V1 | Punzonado | 17.75 | min_per_unit |
| CNCE125 | Corte | 0.25 | min_per_unit |
| CUE12D | Troquelado | 0.12 | min_per_unit |

Los SAMs de Punzonado (17-21 min) son **100x mayores** que los de otros procesos (~0.1-0.3 min). Esto sugiere que el SAM de Punzonado representa el **tiempo por golpe de combo** (que produce varias piezas a la vez), no el tiempo por unidad individual.

### Problema adicional: Registros duplicados

Existen **2 filas duplicadas** para TSCE125 en Punzonado (y para varias otras referencias). El RPC usa `DISTINCT ON` para seleccionar una, pero los duplicados podrían causar problemas en otros flujos.

---

## Plan de Corrección

### Opcion A: Corregir el SAM en la base de datos (Recomendado si el SAM está incorrecto)

Si 21 min/unidad es incorrecto y debería ser algo como 0.21 min/unidad (o si el SAM realmente es "min por golpe de combo" y cada golpe produce N piezas):

- Actualizar el registro en `machines_processes` con el valor correcto
- Eliminar los registros duplicados

### Opcion B: Cambiar la unidad del SAM a nivel de combo

Si el SAM=21 es correcto pero representa "minutos por combo" (no por unidad individual), hay que:

- Agregar lógica en el RPC para dividir el SAM por la cantidad de piezas que produce cada golpe de combo
- O cambiar el `sam_unit` a un valor que refleje la realidad

### Opcion C: Excluir Punzonado del scheduling para referencias combo

Siguiendo la memoria existente (`capacity/punzonado-combo-exclusive-time-source`), el tiempo de Punzonado ya se maneja exclusivamente desde la etapa de "Combo Configuration". Por lo tanto:

- Excluir del scheduling los nodos de Punzonado para referencias que ya se calculan como combos
- Esto es consistente con la lógica actual de "Capacidad por Proceso"

---

## Implementacion Tecnica (Opcion C - Más segura)

### Cambio 1: Migración SQL - Filtrar Punzonado de referencias combo en el RPC

Modificar la query de `_sched_nodes` en `calculate_schedule_with_capacity` para excluir el proceso de Punzonado (id=20) cuando la referencia NO termina en `-CMB` pero tiene un SAM mayor a un umbral razonable (por ejemplo, mayor a 5 min/unit). Alternativamente, excluir Punzonado completamente del scheduling y usar el tiempo de combo ya calculado.

### Cambio 2: Limpiar duplicados en `machines_processes`

Eliminar las filas duplicadas para evitar inconsistencias futuras.

### Archivos a modificar:
- **Nueva migración SQL**: Actualizar el RPC para manejar correctamente Punzonado/combos
- **Limpieza de datos**: Eliminar registros duplicados en `machines_processes`

