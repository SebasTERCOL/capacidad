
# Fix: Missing References in Capacity Analysis

## Problem
References like DFCA30, T-CA30, TCHCA30, and TSCA30 are not appearing in Doblez, Horno, and Lavado processes despite existing in the database. The process "Lavado" disappears entirely.

## Root Cause
Both `ProductionProjectionV2.tsx` and `InventoryAdjustment.tsx` paginate the `machines_processes` table (9,246 rows) using `.range()` **without specifying `.order()`**. Without deterministic ordering, rows can be skipped between pagination requests, causing some references to never be loaded into memory.

## Technical Fix

### 1. ProductionProjectionV2.tsx - `loadAllMachinesProcesses()`
Add `.order('id')` to the paginated query to guarantee all rows are loaded in a stable order.

```typescript
const { data: page, error } = await supabase
  .from('machines_processes')
  .select(`
    sam, sam_unit, frequency, ref, id_machine, id_process,
    machines!inner(id, name, status),
    processes!inner(id, name)
  `)
  .order('id')          // <-- ADD THIS
  .range(from, to);
```

### 2. InventoryAdjustment.tsx - Paginated machines_processes query
Same fix for the component process mapping query.

```typescript
const { data: mpPage } = await supabase
  .from('machines_processes')
  .select('ref, id_process')
  .order('id')           // <-- ADD THIS
  .range(mpFrom, mpFrom + mpPageSize - 1);
```

### 3. Add verification logging
After loading, verify that the expected count matches and key references exist:

```typescript
console.log(`Total loaded: ${all.length} rows`);
// Quick verification of critical refs
const testRefs = ['DFCA30', 'T-CA30', 'TCHCA30', 'TSCA30', 'CCA30'];
for (const ref of testRefs) {
  const count = all.filter(mp => mp.ref === ref).length;
  if (count > 0) console.log(`  Verified: ${ref} has ${count} entries`);
}
```

## Expected Result
- **Doblez**: Will show all 6 references (CNCA30, DFCA30, T-CA30, TCHCA30, TSCA30, PTCA-30) with Cant: 1
- **Horno**: Will show both CCA30 and T-CA30
- **Lavado**: Will reappear with CCA30 and T-CA30
