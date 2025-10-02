-- Actualizar sam_unit para el proceso Punzonado (id_process 20)
UPDATE public.machines_processes
SET sam_unit = 'min_per_unit'
WHERE id_process = 20;