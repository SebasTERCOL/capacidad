
-- =============================================================
-- FASE 3: Festivos colombianos + calculate_schedule_with_capacity
-- =============================================================

-- 1. Función auxiliar: Calcular Domingo de Pascua (algoritmo Meeus/Jones/Butcher)
CREATE OR REPLACE FUNCTION public.easter_sunday(p_year INTEGER)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  a INT; b INT; c INT; d INT; e INT;
  f INT; g INT; h INT; i INT; k INT;
  l INT; m INT; mes INT; dia INT;
BEGIN
  a := p_year % 19;
  b := p_year / 100;
  c := p_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_year, mes, dia);
END;
$$;

-- 2. Función auxiliar: Mover al lunes siguiente (Ley Emiliani)
CREATE OR REPLACE FUNCTION public.next_monday(p_date DATE)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  dow INT;
BEGIN
  dow := EXTRACT(ISODOW FROM p_date)::INT; -- 1=lunes, 7=domingo
  IF dow = 1 THEN RETURN p_date; END IF;
  RETURN p_date + (8 - dow);
END;
$$;

-- 3. Función: Obtener todos los festivos colombianos de un año
CREATE OR REPLACE FUNCTION public.get_colombian_holidays(p_year INTEGER)
RETURNS TABLE(holiday_date DATE, holiday_name TEXT)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  easter DATE;
BEGIN
  easter := public.easter_sunday(p_year);

  -- Festivos fijos (NO se trasladan)
  RETURN QUERY VALUES
    (make_date(p_year, 1, 1),   'Año Nuevo'),
    (make_date(p_year, 5, 1),   'Día del Trabajo'),
    (make_date(p_year, 7, 20),  'Independencia'),
    (make_date(p_year, 8, 7),   'Batalla de Boyacá'),
    (make_date(p_year, 12, 8),  'Inmaculada Concepción'),
    (make_date(p_year, 12, 25), 'Navidad');

  -- Festivos trasladados (Ley Emiliani)
  RETURN QUERY VALUES
    (public.next_monday(make_date(p_year, 1, 6)),   'Reyes Magos'),
    (public.next_monday(make_date(p_year, 3, 19)),  'San José'),
    (public.next_monday(make_date(p_year, 6, 29)),  'San Pedro y San Pablo'),
    (public.next_monday(make_date(p_year, 8, 15)),  'Asunción de la Virgen'),
    (public.next_monday(make_date(p_year, 10, 12)), 'Día de la Raza'),
    (public.next_monday(make_date(p_year, 11, 1)),  'Todos los Santos'),
    (public.next_monday(make_date(p_year, 11, 11)), 'Independencia de Cartagena');

  -- Semana Santa
  RETURN QUERY VALUES
    (easter - 3, 'Jueves Santo'),
    (easter - 2, 'Viernes Santo');

  -- Festivos basados en Pascua (trasladados)
  RETURN QUERY VALUES
    (public.next_monday(easter + 43), 'Ascensión del Señor'),
    (public.next_monday(easter + 64), 'Corpus Christi'),
    (public.next_monday(easter + 71), 'Sagrado Corazón');
END;
$$;

-- 4. Función principal: calculate_schedule_with_capacity
CREATE OR REPLACE FUNCTION public.calculate_schedule_with_capacity(
  p_references TEXT[],
  p_quantities NUMERIC[],
  p_month INTEGER,
  p_year INTEGER,
  p_hours_per_shift NUMERIC DEFAULT 7.83,
  p_operators JSONB DEFAULT '{}'::JSONB  -- {"process_id": num_operators, ...}
)
RETURNS TABLE(
  referencia TEXT,
  proceso_nombre TEXT,
  proceso_id BIGINT,
  mejor_maquina TEXT,
  cantidad NUMERIC,
  sam NUMERIC,
  duracion_min NUMERIC,
  es NUMERIC,
  ef NUMERIC,
  ls NUMERIC,
  lf NUMERIC,
  slack NUMERIC,
  is_critical BOOLEAN,
  makespan NUMERIC,
  -- Nuevos campos de capacidad
  dias_habiles INTEGER,
  operarios_proceso INTEGER,
  minutos_disponibles NUMERIC,
  porcentaje_capacidad NUMERIC,
  desborda BOOLEAN,
  dias_overflow NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_working_days INTEGER;
  v_month_start DATE;
  v_month_end DATE;
  v_current_date DATE;
  v_holidays DATE[];
  v_max_iter INTEGER := 50;
  v_changed BOOLEAN;
  v_total_makespan NUMERIC;
  v_iter INTEGER;
BEGIN
  -- =============================================
  -- PASO 0: Calcular días hábiles del mes
  -- =============================================
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Obtener festivos del año como array
  SELECT array_agg(h.holiday_date) INTO v_holidays
  FROM public.get_colombian_holidays(p_year) h;

  -- Si el mes es diciembre, también traer festivos de enero del año siguiente (por si overflow)
  -- Y si es enero, traer del año anterior (para Reyes Magos trasladado)
  IF p_month = 12 THEN
    v_holidays := v_holidays || (SELECT array_agg(h.holiday_date) FROM public.get_colombian_holidays(p_year + 1) h);
  END IF;

  -- Contar días hábiles (lunes a sábado, excluyendo festivos)
  v_working_days := 0;
  v_current_date := v_month_start;
  WHILE v_current_date <= v_month_end LOOP
    -- Excluir domingos (ISODOW = 7) y festivos
    IF EXTRACT(ISODOW FROM v_current_date) < 7
       AND NOT (v_current_date = ANY(v_holidays)) THEN
      v_working_days := v_working_days + 1;
    END IF;
    v_current_date := v_current_date + 1;
  END LOOP;

  -- =============================================
  -- PASO 1-5: Reutilizar lógica de calculate_schedule
  -- (BOM expansion, nodos, forward/backward pass)
  -- =============================================

  -- Crear tabla temporal con nodos del schedule
  CREATE TEMP TABLE IF NOT EXISTS schedule_nodes ON COMMIT DROP AS
  SELECT * FROM (SELECT 1 WHERE FALSE) AS dummy_empty;
  DROP TABLE IF EXISTS schedule_nodes;

  CREATE TEMP TABLE schedule_nodes AS
  WITH RECURSIVE bom_tree AS (
    SELECT
      unnest(p_references) AS root_ref,
      unnest(p_references) AS component_ref,
      unnest(p_quantities)::double precision AS total_qty,
      0 AS lvl
    UNION ALL
    SELECT
      bt.root_ref,
      b.component_id,
      bt.total_qty * b.amount,
      bt.lvl + 1
    FROM bom_tree bt
    JOIN bom b ON b.product_id = bt.component_ref
    WHERE bt.lvl < 10
  ),
  aggregated AS (
    SELECT component_ref, SUM(total_qty) AS total_qty
    FROM bom_tree
    GROUP BY component_ref
  ),
  best_machines AS (
    SELECT DISTINCT ON (mp.ref, mp.id_process)
      mp.ref,
      mp.id_process,
      p.name AS process_name,
      m.name AS machine_name,
      mp.sam,
      mp.sam_unit,
      mp.frequency,
      mp.condicion_inicial
    FROM machines_processes mp
    JOIN processes p ON p.id = mp.id_process AND p.is_schedulable = true
    JOIN machines m ON m.id = mp.id_machine AND m.status = 'ENCENDIDO'
    ORDER BY mp.ref, mp.id_process,
      CASE mp.sam_unit
        WHEN 'min_per_unit' THEN mp.sam
        WHEN 'units_per_min' THEN 1.0 / NULLIF(mp.sam, 0)
        WHEN 'units_per_hour' THEN 60.0 / NULLIF(mp.sam, 0)
      END ASC
  ),
  raw_nodes AS (
    SELECT
      a.component_ref AS referencia,
      bm.process_name AS proceso_nombre,
      bm.id_process AS proceso_id,
      bm.machine_name AS mejor_maquina,
      a.total_qty::numeric AS cantidad,
      bm.sam,
      CASE bm.sam_unit
        WHEN 'min_per_unit' THEN a.total_qty * bm.sam
        WHEN 'units_per_min' THEN a.total_qty / NULLIF(bm.sam, 0)
        WHEN 'units_per_hour' THEN a.total_qty / NULLIF(bm.sam / 60.0, 0)
      END::numeric AS duracion_min,
      0::numeric AS earliest_start,
      0::numeric AS earliest_finish,
      0::numeric AS latest_start,
      0::numeric AS latest_finish,
      0::numeric AS node_slack,
      FALSE AS critical
    FROM aggregated a
    JOIN best_machines bm ON bm.ref = a.component_ref
  )
  SELECT * FROM raw_nodes;

  -- EF inicial
  UPDATE schedule_nodes SET earliest_finish = duracion_min;

  -- Forward Pass
  v_iter := 0;
  LOOP
    v_changed := FALSE;
    v_iter := v_iter + 1;

    UPDATE schedule_nodes sn
    SET earliest_start = sub.max_ef,
        earliest_finish = sub.max_ef + sn.duracion_min
    FROM (
      SELECT sn2.referencia, sn2.proceso_id,
        MAX(pred.earliest_finish) AS max_ef
      FROM schedule_nodes sn2
      JOIN process_dependencies pd ON pd.process_id = sn2.proceso_id
      JOIN schedule_nodes pred ON pred.proceso_id = pd.depends_on_process_id
        AND pred.referencia = sn2.referencia
      GROUP BY sn2.referencia, sn2.proceso_id
    ) sub
    WHERE sn.referencia = sub.referencia
      AND sn.proceso_id = sub.proceso_id
      AND sn.earliest_start < sub.max_ef;

    IF NOT FOUND OR v_iter >= v_max_iter THEN EXIT; END IF;
  END LOOP;

  -- Makespan
  SELECT MAX(earliest_finish) INTO v_total_makespan FROM schedule_nodes;
  IF v_total_makespan IS NULL THEN v_total_makespan := 0; END IF;

  -- Backward Pass init
  UPDATE schedule_nodes
  SET latest_finish = v_total_makespan,
      latest_start = v_total_makespan - duracion_min;

  -- Backward Pass
  v_iter := 0;
  LOOP
    v_changed := FALSE;
    v_iter := v_iter + 1;

    UPDATE schedule_nodes sn
    SET latest_finish = sub.min_ls,
        latest_start = sub.min_ls - sn.duracion_min
    FROM (
      SELECT sn2.referencia, sn2.proceso_id,
        MIN(succ.latest_start) AS min_ls
      FROM schedule_nodes sn2
      JOIN process_dependencies pd ON pd.depends_on_process_id = sn2.proceso_id
      JOIN schedule_nodes succ ON succ.proceso_id = pd.process_id
        AND succ.referencia = sn2.referencia
      GROUP BY sn2.referencia, sn2.proceso_id
    ) sub
    WHERE sn.referencia = sub.referencia
      AND sn.proceso_id = sub.proceso_id
      AND sn.latest_finish > sub.min_ls;

    IF NOT FOUND OR v_iter >= v_max_iter THEN EXIT; END IF;
  END LOOP;

  -- Slack y ruta crítica
  UPDATE schedule_nodes
  SET node_slack = latest_start - earliest_start,
      critical = (latest_start - earliest_start < 1.0);

  -- =============================================
  -- PASO 6: Calcular capacidad mensual por proceso
  -- =============================================
  RETURN QUERY
  SELECT
    sn.referencia,
    sn.proceso_nombre,
    sn.proceso_id,
    sn.mejor_maquina,
    sn.cantidad,
    sn.sam,
    sn.duracion_min,
    sn.earliest_start AS es,
    sn.earliest_finish AS ef,
    sn.latest_start AS ls,
    sn.latest_finish AS lf,
    sn.node_slack AS slack,
    sn.critical AS is_critical,
    v_total_makespan AS makespan,
    -- Campos de capacidad
    v_working_days AS dias_habiles,
    COALESCE((p_operators->>sn.proceso_id::text)::integer, 1) AS operarios_proceso,
    -- Minutos disponibles = días_hábiles × horas_turno × 60 × operarios
    (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proceso_id::text)::integer, 1))::numeric AS minutos_disponibles,
    -- % capacidad = (tiempo_consumido / disponible) × 100
    CASE
      WHEN v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proceso_id::text)::integer, 1) > 0
      THEN ROUND((sn.duracion_min / (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proceso_id::text)::integer, 1)) * 100)::numeric, 2)
      ELSE 0
    END AS porcentaje_capacidad,
    -- ¿Desborda?
    sn.duracion_min > (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proceso_id::text)::integer, 1)) AS desborda,
    -- Días de overflow (cuántos días extra se necesitan)
    CASE
      WHEN sn.duracion_min > (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proceso_id::text)::integer, 1))
      THEN ROUND(((sn.duracion_min - (v_working_days * p_hours_per_shift * 60 * COALESCE((p_operators->>sn.proceso_id::text)::integer, 1))) / (p_hours_per_shift * 60))::numeric, 2)
      ELSE 0
    END AS dias_overflow
  FROM schedule_nodes sn
  ORDER BY sn.earliest_start, sn.proceso_id;

  -- Cleanup
  DROP TABLE IF EXISTS schedule_nodes;
END;
$$;
