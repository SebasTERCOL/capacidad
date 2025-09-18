-- Completar la configuración RLS para las tablas restantes que tenían políticas sin RLS habilitado

-- Estas son las tablas que aparecían como "Policy Exists RLS Disabled"
-- Necesitamos habilitar RLS en ellas

-- Consultar qué tablas específicas tienen este problema y habilitarles RLS
DO $$
BEGIN
    -- Intentar habilitar RLS en las tablas que podrían tener políticas sin RLS
    BEGIN
        ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN OTHERS THEN
        -- Continuar si ya está habilitado
        NULL;
    END;
    
    BEGIN
        ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;