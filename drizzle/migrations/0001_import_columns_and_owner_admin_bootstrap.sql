-- Columns present in the original exports, kept so imported data is preserved.
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS sport text DEFAULT 'Cricket';
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS season text;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS source_provider text;

-- One-time owner bootstrap: when the site owner's email is confirmed on this backend,
-- grant admin — but only while no administrator exists yet. After the first admin
-- exists this does nothing. Users cannot call it; it only runs from the auth trigger.
CREATE OR REPLACE FUNCTION public.bootstrap_owner_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'sanjidsojeeb@gmail.com'
     AND NEW.email_confirmed_at IS NOT NULL
     AND OLD.email_confirmed_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block sign-up or confirmation because of this helper.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_owner_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_bootstrap_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_bootstrap_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_owner_admin();