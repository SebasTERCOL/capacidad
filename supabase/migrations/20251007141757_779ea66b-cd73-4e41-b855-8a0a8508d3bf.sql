-- Actualizar sam_unit para el proceso Lavado (id_process = 70)
-- Cambiar de units_per_min a min_per_unit (sin cambiar el valor de sam)
UPDATE machines_processes 
SET sam_unit = 'min_per_unit'::sam_unit_type 
WHERE id_process = 70 AND sam_unit = 'units_per_min'::sam_unit_type;