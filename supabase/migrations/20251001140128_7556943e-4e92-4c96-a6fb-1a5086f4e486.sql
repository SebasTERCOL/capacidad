-- Agregar tipo de unidad SAM a la tabla machines_processes
-- Esto permite especificar si SAM está en minutos/unidad o unidades/minuto

-- Crear tipo enum para las unidades de SAM
CREATE TYPE sam_unit_type AS ENUM ('min_per_unit', 'units_per_min');

-- Agregar columna a la tabla machines_processes
ALTER TABLE public.machines_processes 
ADD COLUMN sam_unit sam_unit_type NOT NULL DEFAULT 'units_per_min';

-- Comentario para documentar el campo
COMMENT ON COLUMN public.machines_processes.sam_unit IS 'Tipo de unidad del SAM: min_per_unit (minutos/unidad) o units_per_min (unidades/minuto)';