-- Actualizar sam_unit para el proceso Lavado (id_process = 70)
-- Cambiar TODOS los registros de units_per_min a min_per_unit
UPDATE machines_processes 
SET sam_unit = 'min_per_unit'::sam_unit_type 
WHERE id_process = 70;