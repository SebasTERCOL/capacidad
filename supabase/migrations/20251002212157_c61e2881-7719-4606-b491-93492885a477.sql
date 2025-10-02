-- Actualizar sam_unit para el proceso Horno (id_process 2)
UPDATE public.machines_processes
SET sam_unit = 'min_per_unit'
WHERE id_process = 2;