-- Actualizar sam_unit para el proceso Tapas (id_process = 1)
-- Cambiar de units_per_min a min_per_unit (sin cambiar el valor de sam)
UPDATE machines_processes 
SET sam_unit = 'min_per_unit'::sam_unit_type 
WHERE id_process = 1 AND sam_unit = 'units_per_min'::sam_unit_type;

-- Actualizar sam_unit para el proceso EnsambleInt (id_process = 130)
-- Cambiar de units_per_min a min_per_unit Y calcular el inverso del sam (regla de 3)
-- Si sam = 0.2 units_per_min, entonces nuevo sam = 1/0.2 = 5 min_per_unit
UPDATE machines_processes 
SET 
  sam = CASE 
    WHEN sam != 0 THEN 1.0 / sam 
    ELSE sam 
  END,
  sam_unit = 'min_per_unit'::sam_unit_type 
WHERE id_process = 130 AND sam_unit = 'units_per_min'::sam_unit_type;