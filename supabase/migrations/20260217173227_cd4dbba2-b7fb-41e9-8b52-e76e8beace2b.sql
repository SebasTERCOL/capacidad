
CREATE TABLE public.capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  created_by text,
  user_cedula text,
  user_id integer,
  month integer,
  year integer,
  use_inventory boolean,
  input_data jsonb,
  combo_data jsonb,
  operator_config jsonb,
  overtime_config jsonb,
  projection_result jsonb,
  total_minutes numeric,
  total_alerts integer
);

ALTER TABLE public.capacity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública de capacity_snapshots"
  ON public.capacity_snapshots
  FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserción en capacity_snapshots"
  ON public.capacity_snapshots
  FOR INSERT
  WITH CHECK (true);
