
CREATE OR REPLACE FUNCTION public.calculate_schedule_with_capacity(
  p_references text[], p_quantities numeric[], p_month integer, p_year integer,
  p_hours_per_shift numeric DEFAULT 7.83, p_operators jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  referencia text, proceso_nombre text, proceso_id bigint, mejor_maquina text,
  cantidad numeric, sam numeric, duracion_min numeric,
  es numeric, ef numeric, ls numeric, lf numeric, slack numeric,
  is_critical boolean, makespan numeric,
  dias_habiles integer, operarios_proceso integer, minutos_disponibles numeric,
  porcentaje_capacidad numeric, desborda boolean, dias_overflow numeric
)
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_working_days INTEGER;
  v_month_start DATE;
  v_month_end DATE;
  v_current_date DATE;
  v_holidays DATE[];
  v_max_iter INTEGER := 50;
  v_total_makespan NUMERIC;
  v_iter INTEGER;
  v_changed BOOLEAN;
  v_node RECORD;
  v_machine_free NUMERIC;
BEGIN
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT array_agg(h.holiday_date) INTO v_holidays
  FROM public.get_colombian_holidays(p_year) h;
  IF p_month = 12 THEN
    v_holidays := v_holidays || (SELECT array_agg(h.holiday_date) FROM public.get_colombian_holidays(p_year+1) h);
  END IF;

  v_working_days := 0;
  v_current_date := v_month_start;
  WHILE v_current_date <= v_month_end LOOP
    IF EXTRACT(ISODOW FROM v_current_date) < 7
       AND NOT (v_current_date = ANY(v_holidays)) THEN
      v_working_days := v_working_days + 1;
    END IF;
    v_current_date := v_current_date + 1;
  END LOOP;

  DROP TABLE IF EXISTS _sched_nodes;

  CREATE TEMP TABLE _sched_nodes AS
  WITH RECURSIVE bom_tree AS (
    SELECT unnest(p_references) AS root_ref, unnest(p_references) AS component_ref,
           unnest(p_quantities)::double precision AS total_qty, 0 AS lvl
    UNION ALL
    SELECT bt.root_ref, b.component_id, bt.total_qty * b.amount, bt.lvl + 1
    FROM bom_tree bt JOIN bom b ON b.product_id = bt.component_ref WHERE bt.lvl < 10
  ),
  aggregated AS (
    SELECT component_ref, SUM(total_qty) AS total_qty FROM bom_tree GROUP BY component_ref
  ),
  best_machines AS (
    SELECT DISTINCT ON (mp.ref, mp.id_process)
      mp.ref, mp.id_process, p.name::text AS process_name, m.name::text AS machine_name,
      mp.sam, mp.sam_unit
    FROM machines_processes mp
    JOIN processes p ON p.id = mp.id_process AND p.is_schedulable = true
    JOIN machines m ON m.id = mp.id_machine AND m.status = 'ENCENDIDO'
    ORDER BY mp.ref, mp.id_process,
      CASE mp.sam_unit
        WHEN 'min_per_unit' THEN mp.sam
        WHEN 'units_per_min' THEN 1.0 / NULLIF(mp.sam, 0)
        WHEN 'units_per_hour' THEN 60.0 / NULLIF(mp.sam, 0)
      END ASC
  )
  SELECT
    row_number() OVER () AS node_id,
    aggregated.component_ref::text AS ref,
    bm.process_name::text AS proc_name,
    bm.id_process AS proc_id,
    bm.machine_name::text AS mach_name,
    aggregated.total_qty::numeric AS qty,
    bm.sam AS sam_val,
    (CASE bm.sam_unit
      WHEN 'min_per_unit' THEN aggregated.total_qty * bm.sam
      WHEN 'units_per_min' THEN aggregated.total_qty / NULLIF(bm.sam, 0)
      WHEN 'units_per_hour' THEN aggregated.total_qty / NULLIF(bm.sam / 60.0, 0)
    END)::numeric AS dur_min,
    0::numeric AS e_start, 0::numeric AS e_finish,
    0::numeric AS l_start, 0::numeric AS l_finish,
    0::numeric AS n_slack, FALSE AS is_crit
  FROM aggregated JOIN best_machines bm ON bm.ref = aggregated.component_ref;

  -- Forward Pass (precedence only)
  UPDATE _sched_nodes SET e_finish = dur_min;

  v_iter := 0;
  LOOP
    v_iter := v_iter + 1;
    UPDATE _sched_nodes sn
    SET e_start = sub.max_ef, e_finish = sub.max_ef + sn.dur_min
    FROM (
      SELECT sn2.ref, sn2.proc_id, MAX(pred.e_finish) AS max_ef
      FROM _sched_nodes sn2
      JOIN process_dependencies pd ON pd.process_id = sn2.proc_id
      JOIN _sched_nodes pred ON pred.proc_id = pd.depends_on_process_id AND pred.ref = sn2.ref
      GROUP BY sn2.ref, sn2.proc_id
    ) sub WHERE sn.ref = sub.ref AND sn.proc_id = sub.proc_id AND sn.e_start < sub.max_ef;
    IF NOT FOUND OR v_iter >= v_max_iter THEN EXIT; END IF;
  END LOOP;

  -- ── PHASE 4: Resource Leveling (RCPSP) ──
  DROP TABLE IF EXISTS _machine_timeline;
  CREATE TEMP TABLE _machine_timeline (
    machine_name TEXT PRIMARY KEY,
    free_at NUMERIC DEFAULT 0
  );
  INSERT INTO _machine_timeline (machine_name, free_at)
  SELECT DISTINCT mach_name, 0 FROM _sched_nodes;

  v_iter := 0;
  LOOP
    v_iter := v_iter + 1;
    v_changed := false;

    UPDATE _machine_timeline SET free_at = 0;

    FOR v_node IN
      SELECT node_id, ref, proc_id, mach_name, dur_min, e_start, e_finish
      FROM _sched_nodes ORDER BY e_start, proc_id, ref
    LOOP
      SELECT free_at INTO v_machine_free
      FROM _machine_timeline WHERE machine_name = v_node.mach_name;

      IF v_machine_free > v_node.e_start THEN
        UPDATE _sched_nodes
        SET e_start = v_machine_free, e_finish = v_machine_free + dur_min
        WHERE node_id = v_node.node_id;
        v_changed := true;
        UPDATE _machine_timeline SET free_at = v_machine_free + v_node.dur_min WHERE machine_name = v_node.mach_name;
      ELSE
        UPDATE _machine_timeline SET free_at = v_node.e_finish WHERE machine_name = v_node.mach_name;
      END IF;
    END LOOP;

    -- Re-propagate precedence after machine delays
    LOOP
      UPDATE _sched_nodes sn
      SET e_start = sub.max_ef, e_finish = sub.max_ef + sn.dur_min
      FROM (
        SELECT sn2.ref, sn2.proc_id, MAX(pred.e_finish) AS max_ef
        FROM _sched_nodes sn2
        JOIN process_dependencies pd ON pd.process_id = sn2.proc_id
        JOIN _sched_nodes pred ON pred.proc_id = pd.depends_on_process_id AND pred.ref = sn2.ref
        GROUP BY sn2.ref, sn2.proc_id
      ) sub WHERE sn.ref = sub.ref AND sn.proc_id = sub.proc_id AND sn.e_start < sub.max_ef;
      IF NOT FOUND THEN EXIT; END IF;
      v_changed := true;
    END LOOP;

    IF NOT v_changed OR v_iter >= v_max_iter THEN EXIT; END IF;
  END LOOP;

  SELECT MAX(e_finish) INTO v_total_makespan FROM _sched_nodes;
  IF v_total_makespan IS NULL THEN v_total_makespan := 0; END IF;

  -- Backward Pass
  UPDATE _sched_nodes SET l_finish = v_total_makespan, l_start = v_total_makespan - dur_min;

  v_iter := 0;
  LOOP
    v_iter := v_iter + 1;
    UPDATE _sched_nodes sn
    SET l_finish = sub.min_ls, l_start = sub.min_ls - sn.dur_min
    FROM (
      SELECT sn2.ref, sn2.proc_id, MIN(succ.l_start) AS min_ls
      FROM _sched_nodes sn2
      JOIN process_dependencies pd ON pd.depends_on_process_id = sn2.proc_id
      JOIN _sched_nodes succ ON succ.proc_id = pd.process_id AND succ.ref = sn2.ref
      GROUP BY sn2.ref, sn2.proc_id
    ) sub WHERE sn.ref = sub.ref AND sn.proc_id = sub.proc_id AND sn.l_finish > sub.min_ls;
    IF NOT FOUND OR v_iter >= v_max_iter THEN EXIT; END IF;
  END LOOP;

  UPDATE _sched_nodes SET n_slack = l_start - e_start, is_crit = (l_start - e_start < 1.0);

  RETURN QUERY
  SELECT
    sn.ref::text, sn.proc_name::text, sn.proc_id, sn.mach_name::text,
    sn.qty, sn.sam_val, sn.dur_min,
    sn.e_start, sn.e_finish, sn.l_start, sn.l_finish, sn.n_slack, sn.is_crit,
    v_total_makespan, v_working_days,
    COALESCE((p_operators->>sn.proc_id::text)::integer, 1),
    (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proc_id::text)::integer, 1))::numeric,
    CASE WHEN v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proc_id::text)::integer, 1) > 0
      THEN ROUND((sn.dur_min / (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proc_id::text)::integer, 1)) * 100)::numeric, 2)
      ELSE 0 END,
    sn.dur_min > (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proc_id::text)::integer, 1)),
    CASE WHEN sn.dur_min > (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proc_id::text)::integer, 1))
      THEN ROUND(((sn.dur_min - (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proc_id::text)::integer, 1))) / (p_hours_per_shift * 60))::numeric, 2)
      ELSE 0 END
  FROM _sched_nodes sn ORDER BY sn.e_start, sn.proc_id;

  DROP TABLE IF EXISTS _sched_nodes;
  DROP TABLE IF EXISTS _machine_timeline;
END;
$function$;
