-- Habilitar RLS y crear políticas para todas las tablas restantes

-- Habilitar RLS en tablas que no lo tienen
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buy_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buy_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission ENABLE ROW LEVEL SECURITY;

-- Crear políticas para las tablas restantes necesarias para el sistema de capacidad

-- Política para movements (para tracking de inventario)
CREATE POLICY "Permitir lectura pública de movements" 
ON public.movements 
FOR SELECT 
USING (true);

-- Política para warehouse (para inventario)
CREATE POLICY "Permitir lectura pública de warehouse" 
ON public.warehouse 
FOR SELECT 
USING (true);

-- Política para schedule (para programación)
CREATE POLICY "Permitir lectura pública de schedule" 
ON public.schedule 
FOR SELECT 
USING (true);

-- Política para projection (para almacenar proyecciones)
CREATE POLICY "Permitir lectura pública de projection" 
ON public.projection 
FOR SELECT 
USING (true);

-- Política para request (para solicitudes de producción)
CREATE POLICY "Permitir lectura pública de request" 
ON public.request 
FOR SELECT 
USING (true);

-- Políticas básicas para otras tablas (no críticas para la funcionalidad actual pero necesarias por seguridad)
CREATE POLICY "Permitir lectura pública de buy_orders" 
ON public.buy_orders 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir lectura pública de buy_order_items" 
ON public.buy_order_items 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir lectura pública de service_orders" 
ON public.service_orders 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir lectura pública de service_order_items" 
ON public.service_order_items 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir lectura pública de providers" 
ON public.providers 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir lectura pública de permission" 
ON public.permission 
FOR SELECT 
USING (true);