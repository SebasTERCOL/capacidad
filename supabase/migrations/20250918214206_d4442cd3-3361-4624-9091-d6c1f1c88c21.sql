-- Crear políticas RLS para permitir acceso público a datos esenciales del sistema

-- Política para tabla BOM (Bill of Materials)
-- Esta tabla contiene la estructura de productos y es esencial para el cálculo de capacidad
CREATE POLICY "Permitir lectura pública de BOM" 
ON public.bom 
FOR SELECT 
USING (true);

-- Política para tabla machines_processes
-- Esta tabla contiene los SAM (Standard Allowed Minutes) y es crítica para los cálculos
CREATE POLICY "Permitir lectura pública de machines_processes" 
ON public.machines_processes 
FOR SELECT 
USING (true);

-- Política para tabla machines
-- Necesaria para obtener información del estado de las máquinas
CREATE POLICY "Permitir lectura pública de machines" 
ON public.machines 
FOR SELECT 
USING (true);

-- Política para tabla processes
-- Necesaria para obtener información de los procesos
CREATE POLICY "Permitir lectura pública de processes" 
ON public.processes 
FOR SELECT 
USING (true);

-- Política para tabla products
-- Necesaria para validación de componentes e inventario
CREATE POLICY "Permitir lectura pública de products" 
ON public.products 
FOR SELECT 
USING (true);

-- Política para tabla families
-- Soporte para clasificación de productos
CREATE POLICY "Permitir lectura pública de families" 
ON public.families 
FOR SELECT 
USING (true);

-- Habilitar RLS en tablas que no lo tienen (las que aparecen como ERROR en el linter)
ALTER TABLE public.bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines_processes ENABLE ROW LEVEL SECURITY;