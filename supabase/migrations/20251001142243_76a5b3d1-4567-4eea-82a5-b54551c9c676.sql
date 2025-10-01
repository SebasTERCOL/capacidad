-- Actualizar sam_unit para procesos específicos que usan minutos/unidad
-- Lavado (id_process: 70) y Empaque (id_process: 100)

UPDATE public.machines_processes 
SET sam_unit = 'min_per_unit'
WHERE id_process IN (70, 100);