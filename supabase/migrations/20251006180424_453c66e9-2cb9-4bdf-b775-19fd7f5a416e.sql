-- Actualizar sam_unit para el proceso Despunte (id_process = 3)
-- Cambiar de units_per_min a min_per_unit
UPDATE machines_processes 
SET sam_unit = 'min_per_unit'::sam_unit_type 
WHERE id_process = 3 AND sam_unit = 'units_per_min'::sam_unit_type;

-- Actualizar sam_unit para el proceso Doblez (id_process = 40)
-- Cambiar de units_per_min a min_per_unit
UPDATE machines_processes 
SET sam_unit = 'min_per_unit'::sam_unit_type 
WHERE id_process = 40 AND sam_unit = 'units_per_min'::sam_unit_type;