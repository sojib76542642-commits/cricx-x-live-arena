-- Values the SportScore sync last wrote to a match. A field is only re-synced while it still equals
-- this snapshot, so changes an admin makes by hand are never overwritten.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sync_snapshot jsonb;
COMMENT ON COLUMN public.matches.sync_snapshot IS 'Values last written by the SportScore sync; admin edits that differ from it are left alone.';

-- Rows created by the SportScore sync carry a stable key; this stops duplicates at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS matches_sportscore_key_uidx
  ON public.matches (external_match_id)
  WHERE external_match_id LIKE 'sportscore:%';

CREATE TABLE public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'sportscore',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  error text,
  stats jsonb,
  triggered_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sync runs" ON public.sync_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins record their own sync runs" ON public.sync_runs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND triggered_by = auth.uid());
CREATE POLICY "Admins finish sync runs" ON public.sync_runs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX sync_runs_provider_started_idx ON public.sync_runs (provider, started_at DESC);