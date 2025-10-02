-- Actualizar sam_unit para el proceso Pintura (id_process 80)
UPDATE public.machines_processes
SET sam_unit = 'min_per_unit'
WHERE id_process = 80;