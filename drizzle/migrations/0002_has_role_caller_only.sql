CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Only answers for the signed-in caller, so nobody can look up other people's roles.
  select _user_id = auth.uid()
     and exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;