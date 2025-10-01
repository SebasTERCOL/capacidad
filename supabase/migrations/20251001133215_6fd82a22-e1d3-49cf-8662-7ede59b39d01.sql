-- Habilitar políticas INSERT, UPDATE, DELETE para machines_processes

-- Política para insertar referencias
CREATE POLICY "Permitir inserción de referencias en machines_processes"
ON public.machines_processes
FOR INSERT
WITH CHECK (true);

-- Política para actualizar referencias
CREATE POLICY "Permitir actualización de referencias en machines_processes"
ON public.machines_processes
FOR UPDATE
USING (true);

-- Política para eliminar referencias
CREATE POLICY "Permitir eliminación de referencias en machines_processes"
ON public.machines_processes
FOR DELETE
USING (true);