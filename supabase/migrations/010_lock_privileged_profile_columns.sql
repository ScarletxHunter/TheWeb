-- ============================================================
-- Migration 010: Prevent privilege escalation via profile self-update
-- The "Users can update own profile" policy lets a user update any
-- column on their row, including role and quota_bytes. This trigger
-- silently reverts those columns unless the actor is a site admin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  SELECT (role = 'admin') INTO is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(is_admin, FALSE) THEN
    NEW.role := OLD.role;
    NEW.quota_bytes := OLD.quota_bytes;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns_trg ON public.profiles;
CREATE TRIGGER guard_profile_privileged_columns_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();
