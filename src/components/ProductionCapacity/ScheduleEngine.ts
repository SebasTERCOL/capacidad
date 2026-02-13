import { supabase } from "@/integrations/supabase/client";

export interface ScheduleNode {
  referencia: string;
  proceso_nombre: string;
  proceso_id: number;
  mejor_maquina: string;
  cantidad: number;
  sam: number;
  duracion_min: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  is_critical: boolean;
  makespan: number;
  dias_habiles: number;
  operarios_proceso: number;
  minutos_disponibles: number;
  porcentaje_capacidad: number;
  desborda: boolean;
  dias_overflow: number;
}

export interface ScheduleParams {
  references: string[];
  quantities: number[];
  month: number;
  year: number;
  hoursPerShift?: number;
  operators?: Record<string, number>;
}

export async function calculateSchedule(params: ScheduleParams): Promise<ScheduleNode[]> {
  const operatorsJsonb = params.operators ? params.operators : {};

  const { data, error } = await supabase.rpc('calculate_schedule_with_capacity', {
    p_references: params.references,
    p_quantities: params.quantities,
    p_month: params.month,
    p_year: params.year,
    p_hours_per_shift: params.hoursPerShift ?? 7.83,
    p_operators: operatorsJsonb,
  });

  if (error) throw new Error(`Schedule RPC error: ${error.message}`);
  return (data ?? []) as ScheduleNode[];
}

/** Group nodes by process, summing durations */
export function groupByProcess(nodes: ScheduleNode[]) {
  const map = new Map<string, {
    proceso_nombre: string;
    proceso_id: number;
    mejor_maquina: string;
    total_duracion: number;
    refs: number;
    is_critical: boolean;
    minutos_disponibles: number;
    porcentaje_capacidad: number;
    desborda: boolean;
    operarios: number;
  }>();

  for (const n of nodes) {
    const key = `${n.proceso_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_duracion += n.duracion_min;
      existing.refs += 1;
      existing.is_critical = existing.is_critical || n.is_critical;
      existing.porcentaje_capacidad = existing.minutos_disponibles > 0
        ? (existing.total_duracion / existing.minutos_disponibles) * 100
        : 0;
      existing.desborda = existing.total_duracion > existing.minutos_disponibles;
    } else {
      map.set(key, {
        proceso_nombre: n.proceso_nombre,
        proceso_id: n.proceso_id,
        mejor_maquina: n.mejor_maquina,
        total_duracion: n.duracion_min,
        refs: 1,
        is_critical: n.is_critical,
        minutos_disponibles: n.minutos_disponibles,
        porcentaje_capacidad: n.porcentaje_capacidad,
        desborda: n.desborda,
        operarios: n.operarios_proceso,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.proceso_id - b.proceso_id);
}
