
# Auditoría Técnica Completa: Sistema de Capacidad de Producción

## 1. EXPLOSION BOM

### Estado: CORRECTO con advertencias menores

**Funcionamiento actual:**
- `InventoryAdjustment.tsx` (líneas 89-137): Función `getRecursiveBOM` ejecuta recursión con cache (`bomCache`), límite de profundidad 10, y detección de loops circulares vía `visited Set`.
- `ProductionProjectionV2.tsx` (líneas 248-335): Función `getRecursiveBOMOptimized` replica la misma lógica con cache persistente (`bomCache` en estado React).
- Multiplicación acumulativa: `componentQuantity = quantity * bomItem.amount` (línea 316 en ProductionProjectionV2, línea 111 en InventoryAdjustment). Verificado como correcto.

**Verificación con CA-30 (datos reales de BD):**
```
CA-30 (Q=100)
  -> CCA30 (amount=1, qty=100)
     -> CNCA30 (amount=1, qty=100) -> CNCA30-CMB (amount=1, qty=100)
     -> PTCA-30 (amount=1, qty=100) -> PTCA-30-CMB (amount=1, qty=100)
     -> TCHCA30 (amount=1, qty=100) -> TCHCA30-CMB (amount=1, qty=100)
     -> TSCA30 (amount=1, qty=100) -> TSCA30-CMB (amount=1, qty=100)
  -> DFCA30 (amount=1, qty=100) -> DFCA30-CMB (amount=1, qty=100)
  -> T-CA30 (amount=1, qty=100) -> T-CA30-CMB (amount=1, qty=100)
```
La multiplicación acumulativa es correcta matemáticamente.

**Advertencia - Duplicación BOM:**
- La expansión BOM se realiza DOS VECES: primero en `InventoryAdjustment` y luego los datos expandidos se pasan a `ProductionProjectionV2`.
- En `ProductionProjectionV2` (líneas 521-555), hay un comentario explícito que dice "NO debemos re-expandir BOM aquí" y efectivamente NO re-expande. Los datos llegan ya expandidos desde `InventoryAdjustment`.
- CORRECTO: No hay doble expansión.

**Advertencia - Filtro de inclusión en InventoryAdjustment (líneas 418-438):**
- Un componente solo se incluye en `adjustedProductionData` si `componentHasProcesses || isCMBReference`.
- `componentHasProcesses` depende de que la referencia exista en `componentProcessesMap`, que se construye a partir de `machines_processes` cargado con cursor-based pagination.
- Si por alguna razón la referencia no se encuentra en `machines_processes` (ej: diferencia de casing, espacios), el componente se EXCLUYE silenciosamente.
- RIESGO: Referencias como materias primas (PPOLVO1, T3161CM, B-ARMI, etc.) que no tienen procesos en `machines_processes` se excluyen correctamente (son MP, no necesitan producción). Pero si un componente productivo tuviera un nombre inconsistente, se perdería.

---

## 2. INVENTARIO

### Estado: CORRECTO con una inconsistencia potencial

**Funcionamiento actual:**
- InventoryAdjustment carga TODOS los productos con paginación por `.range()` (líneas 173-191) usando `.order('reference')`.
- Crea `inventoryByNorm` con normalización alfanumérica (solo A-Z, 0-9).
- Fórmula: `cantidadAProducir = max(0, cantidadRequerida - usadoEnEsteProducto)` (línea 387).
- El inventario se aplica DESPUÉS de la recursión BOM completa (correcto).
- Hay control de "procesos excluidos" via `processes.inventario = false`: Tapas, Horno, Lavado, Pintura, Ensamble, Empaque NO descuentan inventario.

**Inconsistencia detectada - Doble sistema de paginación:**
- `InventoryAdjustment` usa `.range()` con `.order('reference')` para productos (líneas 173-191).
- `ProductionProjectionV2` usa `.range()` con `.order('reference')` también (líneas 461-478).
- Sin embargo, para `machines_processes`, se usa cursor-based pagination con `.gt('id', lastId)`.
- Los dos sistemas de paginación son diferentes. Para `products`, `.range()` con `.order()` debería ser determinístico si no hay JOINs. Esto es técnicamente correcto.

**Fórmula "Inventario + Producido - Requerido":**
- En InventoryAdjustment, la fórmula real es: `cantidadAProducir = max(0, cantidadRequerida - usadoEnEsteProducto)` donde `usadoEnEsteProducto = min(restante, cantidadRequerida)`.
- Esto es equivalente a: producir = max(0, requerido - inventario_disponible). CORRECTO.

---

## 3. COMBOS DE PUNZONADO

### Estado: CORRECTO con una fuente de verdad limpia

**Funcionamiento actual:**
- Combos se gestionan en `ComboConfiguration.tsx`.
- `suggestedCombos` es la cantidad de combos a realizar.
- `totalTime = suggestedCombos * cycleTime` (tiempo por combo).
- En `ProductionProjectionV2` (líneas 1177-1297): Los combos se inyectan directamente al proceso Punzonado con `quantity = combo.suggestedCombos` y `sam = combo.cycleTime`.
- Exclusión de BOM para Punzonado (líneas 830-835 y 1044-1050): Cuando hay combos configurados, las referencias BOM con `id_process = 20` se SALTAN explícitamente. Esto evita doble conteo. CORRECTO.

**Verificación:**
- El tiempo se calcula como `suggestedCombos * cycleTime` (min/combo). No como `requerido * sam_individual`.
- `sam_unit` se fuerza a `'min_per_unit'` para combos (líneas 1269, 1280). CORRECTO.

---

## 4. CONFIGURAR OPERARIOS - CALCULO DE HORAS

### Estado: INCONSISTENCIA DETECTADA

**Funcionamiento actual - Modo mes completo (3 turnos):**
```
weekdayHours = 8 + 8 + 8 = 24h bruto
saturdayHours = 6.5 + 6 = 12.5h bruto
Descanso = 25 min por turno
Net = bruto - (turnos * 25/60)
```

**Versus lo solicitado por el usuario:**
```
Lunes a Viernes: 7.584 + 7.617 + 8.8 = 24.001h
Sabado: 6.0834 + 5.917 = 12.0004h
```

**Inconsistencia encontrada:**
- El cálculo de 3 turnos en `calculateAvailableHours` (líneas 72-120) usa `24h bruto - 3*(25/60) = 24 - 1.25 = 22.75h neto` por día de semana.
- El usuario espera `24.001h` neto por día de semana, lo cual sugiere horas ya netas (sin descuento de descanso).
- El cálculo del código da `24 - 1.25 = 22.75h` mientras el usuario espera `24.001h`.
- Para sábados: código da `12.5 - 2*(25/60) = 12.5 - 0.833 = 11.667h` vs usuario espera `12.0004h`.

**Conclusión:** Los valores del usuario (24.001h y 12.0004h) son la suma de las duraciones reales de los turnos (ya incluyen los descansos restados). El código, en cambio, parte de horas brutas redondas (24h, 12.5h) y resta descansos aparte. Esto produce valores diferentes.

**Modo 2 turnos (líneas 123-175):**
- Usa valores precisos: `7.584 + 7.617 = 15.201h` para días de semana. CORRECTO según especificación.
- Pero luego resta `2 * (25/60) = 0.833h`, dando `14.368h` neto.
- Si los valores 7.584 y 7.617 YA tienen el descanso descontado, se estaría restando dos veces.

**Modo rango personalizado (líneas 182-247):**
- Para 3 turnos: usa `bruto = 24h` y resta `3*(25/60)`. Misma inconsistencia que arriba.
- Para 2 turnos: usa los valores precisos y resta `2*(25/60)`. Posible doble descuento.

**Eficiencia:**
- Se aplica en `distributeWorkAcrossMachines` (línea 1691): `horasDisponiblesPorOperario = processGroup.availableHours * efficiencyFactor`.
- `totalHorasDisponibles = processGroup.availableOperators * horasDisponiblesPorOperario` (línea 1692).
- La eficiencia afecta tanto capacidad total como efectividad. CORRECTO.

---

## 5. ASIGNACION DE MAQUINAS POR PROCESO

### Estado: CORRECTO

**Funcionamiento actual (líneas 1594-1661):**
- `findOptimalMachineDistribution`: Obtiene todas las máquinas únicas, calcula un "score de versatilidad" (cuántos componentes puede procesar cada máquina), y selecciona las mejores N máquinas donde N = min(operarios, máquinas disponibles).
- Si `operarios < máquinas`, se seleccionan solo las más versátiles. CORRECTO.
- Si `operarios >= máquinas`, se usan todas las máquinas. CORRECTO.

**Distribución de trabajo (líneas 1664-2027):**
- Las máquinas se ordenan por capacidad disponible (mayor a menor).
- El trabajo se asigna proporcionalmente hasta llenar la capacidad base.
- Si queda tiempo sin asignar, se intenta con horas extras.
- Si aún queda, se registra como "Capacidad insuficiente".

**Verificación regla "no más máquinas que operarios":**
- Línea 1618: `if (processGroup.availableOperators < availableMachines.length)` -> solo selecciona `availableOperators` máquinas.
- CORRECTO: Nunca se activan más máquinas que operarios.

---

## 6. ANALISIS FINAL - CAPACIDAD POR PROCESO

### Estado: CORRECTO con advertencia de cálculo

**Ocupación (%) en createHierarchicalData (líneas 2458-2483):**
```
totalAvailableHours = operators * availableHours * efficiencyFactor * 60  (en minutos)
totalAvailableWithOvertime = totalAvailableHours + totalProcessOvertimeMinutes
totalOccupancy = totalTime / totalAvailableWithOvertime * 100
```
- Fórmula correcta: `Ocupación = Tiempo Requerido / Capacidad Total Disponible`.

**Advertencia - Vista agregada vs desglosada:**
- La vista jerárquica (HierarchicalCapacityView) recibe `processGroups` ya calculados.
- La "Ocupación de Planta" global (líneas 191-209 de HierarchicalCapacityView) suma todos los tiempos requeridos y todos los tiempos disponibles. CORRECTO.
- Hay lógica especial para no duplicar Troquelado/Despunte en totales. CORRECTO.

---

## 7. INCONSISTENCIAS CRITICAS ENCONTRADAS

### 7.1 Calculo de horas disponibles (PRIORIDAD ALTA)
El cálculo de 3 turnos usa valores brutos redondeados (24h, 12.5h) en vez de las duraciones reales de turno que el usuario especifica (7.584 + 7.617 + 8.8 = 24.001h). Esto produce una diferencia de ~1.25h por día en el cálculo mensual, que puede acumularse significativamente (ej: 22 días laborales = ~27.5h de diferencia).

### 7.2 Posible doble descuento de descanso en modo 2 turnos
Si los valores 7.584h y 7.617h ya representan horas netas (con descanso descontado), el código está restando el descanso una segunda vez.

### 7.3 Paginación mixta para products
Se usa `.range()` en vez de cursor-based para la tabla `products`. Aunque con `.order('reference')` debería ser determinístico, es inconsistente con el enfoque cursor-based usado para `machines_processes`.

### 7.4 Lavado: proceso sin descuento de inventario
`processes.inventario = false` para Lavado (id=70). Esto significa que las referencias en Lavado siempre usan la cantidad original sin descontar inventario, lo cual es el comportamiento esperado para procesos de flujo continuo. CORRECTO si es intencional.

---

## 8. LOGICA IMPLICITA NO DOCUMENTADA

1. **Normalización de procesos**: Troquelado y Despunte se unifican automáticamente en "Troquelado / Despunte" (líneas 176-179). Esto es implícito y puede confundir.

2. **Prioridad de pintura PPOLVO1/PPOLVO3**: Hay lógica especial (líneas 1539-1558) que prioriza referencias con PPOLVO1 sobre PPOLVO3 en el proceso de Pintura, y bloquea PPOLVO1 exclusivamente a CB-02 (líneas 2415-2456).

3. **Redistribución con horas extras**: Cuando hay horas extras configuradas y más de 1 máquina, el sistema redistribuye TODAS las referencias entre las máquinas (líneas 2503-2600), lo cual puede cambiar la asignación original.

4. **sam_unit dual**: El sistema soporta `min_per_unit` y otro modo implícito (units_per_min) donde `tiempo = cantidad / sam` en vez de `cantidad * sam` (líneas 1845-1848).

5. **Cache de BOM en React state**: `bomCache` está en un `useState` (línea 67 de ProductionProjectionV2), lo que significa que persiste entre re-renders pero NO entre desmontajes del componente. Si el usuario navega atrás y vuelve, el cache se pierde.
