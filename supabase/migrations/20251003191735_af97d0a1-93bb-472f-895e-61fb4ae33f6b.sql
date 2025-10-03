-- Actualizar sam_unit para el proceso Troquelado (id_process 30)
UPDATE public.machines_processes
SET sam_unit = 'min_per_unit'
WHERE id_process = 30;