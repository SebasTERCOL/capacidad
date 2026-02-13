
-- =============================================
-- FASE 1: Formalizar Dependencias de Procesos
-- =============================================

-- 1. Crear tabla process_dependencies
CREATE TABLE public.process_dependencies (
    id SERIAL PRIMARY KEY,
    process_id INTEGER NOT NULL REFERENCES public.processes(id),
    depends_on_process_id INTEGER NOT NULL REFERENCES public.processes(id),
    UNIQUE(process_id, depends_on_process_id),
    CHECK (process_id != depends_on_process_id)
);

-- Habilitar RLS
ALTER TABLE public.process_dependencies ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (consistente con processes)
CREATE POLICY "Permitir lectura pública de process_dependencies"
ON public.process_dependencies
FOR SELECT
USING (true);

-- 2. Agregar columna is_schedulable a processes
ALTER TABLE public.processes ADD COLUMN is_schedulable BOOLEAN NOT NULL DEFAULT true;

-- 3. Marcar procesos NO schedulables
UPDATE public.processes SET is_schedulable = false
WHERE id IN (110, 150, 160, 170, 180, 190);
-- 110=RecepcionPL, 150=RecepcionAlm, 160=Pulido, 170=RoscadoConectores, 180=Reproceso, 190=Reclasificacion

-- 4. Poblar dependencias reales del flujo de producción
-- Corte(10) es raíz, no depende de nada

-- Punzonado(20) depende de Corte(10)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (20, 10);

-- Troquelado(30) depende de Corte(10)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (30, 10);

-- Doblez(40) depende de Punzonado(20) y Troquelado(30)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (40, 20);
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (40, 30);

-- Soldadura(50) depende de Doblez(40)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (50, 40);

-- Mig(60) depende de Doblez(40)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (60, 40);

-- Lavado(70) depende de Soldadura(50) y Mig(60)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (70, 50);
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (70, 60);

-- Pintura(80) depende de Lavado(70) y Horno(2)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (80, 70);
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (80, 2);

-- Ensamble(90) depende de Pintura(80)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (90, 80);

-- Empaque(100) depende de Ensamble(90)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (100, 90);

-- Remachado(120) depende de Pintura(80) - proceso paralelo a Ensamble
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (120, 80);

-- EnsambleInt(130) depende de Pintura(80)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (130, 80);

-- Tapas(1) es independiente (sin dependencias)
-- Horno(2) es independiente (alimenta a Pintura)
-- Despunte(3) depende de Corte(10)
INSERT INTO public.process_dependencies (process_id, depends_on_process_id) VALUES (3, 10);

-- Inyección(140) es independiente
