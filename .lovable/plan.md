

## Diagnosis: Two Root Problems Found

### Problem 1: Inflated Makespan (2398.1 days / 3.4M minutes)

The reference **TSCE125** (Punzonado, process 20) has a SAM of **21 min/unit**. Through BOM expansion, the total aggregated quantity for TSCE125 reaches **163,400 units**, producing a single-node duration of **3,431,400 minutes** (~2,382 days). This one node dominates the entire schedule and inflates the makespan for all other nodes.

This is likely a **data issue** in `machines_processes`: SAM=21 min_per_unit for TSCE125 in Punzonado seems abnormally high. For comparison, most other processes have SAMs under 1 min/unit. However, the system should also handle this gracefully.

### Problem 2: Critical Path Shows 0 Nodes

The backward pass in the RPC only propagates through `process_dependencies` (same reference). It does **not** account for machine serialization delays introduced by RCPSP. As a result:

- The RCPSP forward pass correctly shifts nodes forward when machines are busy
- But the backward pass calculates Latest Start/Finish ignoring machine constraints
- This creates artificially large slack values, so `l_start - e_start < 1.0` catches nothing

Example: TSCE125 has `es=0, ef=3,431,400` but `ls=21,840` giving `slack=21,840` -- far above the 1.0 threshold.

---

## Proposed Fix

### 1. Fix Critical Path Calculation in the RPC

Replace the simple threshold-based critical path detection with a proper approach:

- After the RCPSP forward pass completes, recalculate the backward pass **including machine serialization order** (not just process dependencies)
- Alternative simpler approach: identify critical nodes as those where `slack / makespan < 0.01` (relative threshold) or simply mark the chain of nodes that determines the makespan by tracing backward from the node with the highest `e_finish`

The recommended approach: **trace the actual critical chain** by finding the node(s) with `e_finish = makespan` and walking backward through both process dependencies AND machine predecessors.

### 2. Validate Punzonado Data

Query and flag to the user that TSCE125 in Punzonado has SAM=21 min/unit with aggregated quantity 163,400 producing 3.4M minutes. This may need correction in the `machines_processes` table.

### 3. Improve MakespanSummary Display

The current display converts minutes to days using `makespan / (7.83 * 60)`. When the makespan is absurdly large due to data issues, add a warning indicator showing which node/process is the bottleneck driving the inflated value.

---

## Technical Changes

### Migration: Update `calculate_schedule_with_capacity` RPC

Modify the critical path detection (line 175 of current RPC) from:

```sql
UPDATE _sched_nodes SET n_slack = l_start - e_start, 
  is_crit = (l_start - e_start < 1.0) WHERE true;
```

To a machine-aware backward pass:

1. Build a machine predecessor chain from the RCPSP ordering
2. During backward pass, propagate `l_finish` constraints through both process dependencies AND machine successor relationships
3. Recalculate slack and critical flag after the complete backward pass

### Frontend: MakespanSummary bottleneck warning

Add a visual warning in `MakespanSummary.tsx` when a single node accounts for more than 50% of the makespan, identifying the bottleneck reference and process.

### Files to modify:
- **New migration SQL**: Updated `calculate_schedule_with_capacity` RPC with machine-aware backward pass
- **`src/components/ProductionCapacity/MakespanSummary.tsx`**: Add bottleneck detection and warning
- **`src/integrations/supabase/types.ts`**: Update if RPC signature changes

