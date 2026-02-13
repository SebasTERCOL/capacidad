
CREATE OR REPLACE FUNCTION public.calculate_schedule(
    p_references TEXT[],
    p_quantities NUMERIC[]
)
RETURNS TABLE(
    referencia TEXT, proceso_id INTEGER, proceso_nombre TEXT, mejor_maquina TEXT,
    cantidad NUMERIC, sam NUMERIC, duracion_min NUMERIC,
    es NUMERIC, ef NUMERIC, ls NUMERIC, lf NUMERIC,
    slack NUMERIC, is_critical BOOLEAN, makespan NUMERIC
)
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_makespan NUMERIC := 0;
    v_changed BOOLEAN;
    v_node RECORD;
    v_max_ef NUMERIC;
    v_min_ls NUMERIC;
BEGIN
    IF array_length(p_references, 1) != array_length(p_quantities, 1) THEN
        RAISE EXCEPTION 'p_references y p_quantities deben tener la misma longitud';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_schedule_nodes (
        node_id SERIAL, ref TEXT NOT NULL, root_ref TEXT NOT NULL,
        process_id INTEGER NOT NULL, process_name TEXT NOT NULL, best_machine TEXT,
        qty NUMERIC NOT NULL, sam_value NUMERIC NOT NULL, duration NUMERIC NOT NULL,
        earliest_start NUMERIC DEFAULT 0, earliest_finish NUMERIC DEFAULT 0,
        latest_start NUMERIC DEFAULT 999999999, latest_finish NUMERIC DEFAULT 999999999,
        node_slack NUMERIC DEFAULT 0, critical BOOLEAN DEFAULT false
    ) ON COMMIT DROP;

    TRUNCATE tmp_schedule_nodes;

    INSERT INTO tmp_schedule_nodes (ref, root_ref, process_id, process_name, best_machine, qty, sam_value, duration)
    WITH RECURSIVE input_refs AS (
        SELECT unnest(p_references) as reference, unnest(p_quantities) as quantity
    ),
    bom_tree AS (
        SELECT ir.reference as root_ref, ir.reference as component_ref,
               ir.quantity::double precision as total_qty, 0 as level
        FROM input_refs ir
        UNION ALL
        SELECT bt.root_ref, b.component_id as component_ref,
               bt.total_qty * b.amount as total_qty, bt.level + 1
        FROM bom_tree bt
        JOIN bom b ON b.product_id = bt.component_ref
        WHERE bt.level < 10
    ),
    component_quantities AS (
        SELECT root_ref, component_ref, SUM(total_qty)::NUMERIC as total_qty
        FROM bom_tree GROUP BY root_ref, component_ref
    ),
    ref_processes AS (
        SELECT DISTINCT ON (cq.root_ref, cq.component_ref, p.id)
            cq.component_ref as ref, cq.root_ref, p.id as process_id,
            p.name as process_name, m.name as machine_name, cq.total_qty,
            mp.sam as sam_value, (cq.total_qty * mp.sam)::NUMERIC as duration
        FROM component_quantities cq
        JOIN machines_processes mp ON UPPER(TRIM(mp.ref)) = UPPER(TRIM(cq.component_ref))
        JOIN processes p ON mp.id_process = p.id AND p.is_schedulable = true
        JOIN machines m ON mp.id_machine = m.id AND m.status = 'ENCENDIDO'
        ORDER BY cq.root_ref, cq.component_ref, p.id, mp.sam ASC
    )
    SELECT rp.ref, rp.root_ref, rp.process_id, rp.process_name,
           rp.machine_name, rp.total_qty, rp.sam_value, rp.duration
    FROM ref_processes rp WHERE rp.duration > 0;

    -- Forward Pass: nodos sin predecesores
    UPDATE tmp_schedule_nodes n SET earliest_finish = n.duration
    WHERE NOT EXISTS (
        SELECT 1 FROM process_dependencies pd WHERE pd.process_id = n.process_id
        AND EXISTS (SELECT 1 FROM tmp_schedule_nodes n2 WHERE n2.process_id = pd.depends_on_process_id AND n2.root_ref = n.root_ref)
    );

    v_changed := true;
    WHILE v_changed LOOP
        v_changed := false;
        FOR v_node IN SELECT n.node_id, n.process_id, n.root_ref, n.duration, n.earliest_start
            FROM tmp_schedule_nodes n WHERE EXISTS (
                SELECT 1 FROM process_dependencies pd WHERE pd.process_id = n.process_id
                AND EXISTS (SELECT 1 FROM tmp_schedule_nodes n2 WHERE n2.process_id = pd.depends_on_process_id AND n2.root_ref = n.root_ref))
        LOOP
            SELECT COALESCE(MAX(n2.earliest_finish), 0) INTO v_max_ef
            FROM process_dependencies pd
            JOIN tmp_schedule_nodes n2 ON n2.process_id = pd.depends_on_process_id AND n2.root_ref = v_node.root_ref
            WHERE pd.process_id = v_node.process_id;
            IF v_max_ef > v_node.earliest_start THEN
                UPDATE tmp_schedule_nodes SET earliest_start = v_max_ef, earliest_finish = v_max_ef + duration WHERE node_id = v_node.node_id;
                v_changed := true;
            END IF;
        END LOOP;
    END LOOP;

    SELECT COALESCE(MAX(earliest_finish), 0) INTO v_makespan FROM tmp_schedule_nodes;

    -- Backward Pass: nodos terminales
    UPDATE tmp_schedule_nodes n SET latest_finish = v_makespan, latest_start = v_makespan - n.duration
    WHERE NOT EXISTS (
        SELECT 1 FROM process_dependencies pd WHERE pd.depends_on_process_id = n.process_id
        AND EXISTS (SELECT 1 FROM tmp_schedule_nodes n2 WHERE n2.process_id = pd.process_id AND n2.root_ref = n.root_ref)
    );

    v_changed := true;
    WHILE v_changed LOOP
        v_changed := false;
        FOR v_node IN SELECT n.node_id, n.process_id, n.root_ref, n.duration, n.latest_finish
            FROM tmp_schedule_nodes n WHERE EXISTS (
                SELECT 1 FROM process_dependencies pd WHERE pd.depends_on_process_id = n.process_id
                AND EXISTS (SELECT 1 FROM tmp_schedule_nodes n2 WHERE n2.process_id = pd.process_id AND n2.root_ref = n.root_ref))
        LOOP
            SELECT COALESCE(MIN(n2.latest_start), v_makespan) INTO v_min_ls
            FROM process_dependencies pd
            JOIN tmp_schedule_nodes n2 ON n2.process_id = pd.process_id AND n2.root_ref = v_node.root_ref
            WHERE pd.depends_on_process_id = v_node.process_id;
            IF v_min_ls < v_node.latest_finish THEN
                UPDATE tmp_schedule_nodes SET latest_finish = v_min_ls, latest_start = v_min_ls - duration WHERE node_id = v_node.node_id;
                v_changed := true;
            END IF;
        END LOOP;
    END LOOP;

    UPDATE tmp_schedule_nodes
    SET node_slack = latest_start - earliest_start,
        critical = (latest_start - earliest_start) < 0.001;

    RETURN QUERY
    SELECT n.ref::TEXT, n.process_id, n.process_name::TEXT, n.best_machine::TEXT,
           n.qty, n.sam_value, n.duration, n.earliest_start, n.earliest_finish,
           n.latest_start, n.latest_finish, n.node_slack, n.critical, v_makespan
    FROM tmp_schedule_nodes n ORDER BY n.earliest_start, n.process_id;
END;
$function$;
