-- ============================================================
-- Migration 011: Expose project-wide usage to admins in the app
-- Returns database size + active file storage so the admin "plan"
-- card can show real numbers without needing a server-side proxy
-- to the Supabase Management API.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_project_usage()
RETURNS TABLE(
  db_bytes BIGINT,
  storage_bytes BIGINT,
  file_count BIGINT,
  user_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins may see project-wide aggregates.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    pg_database_size(current_database())::BIGINT AS db_bytes,
    COALESCE((SELECT SUM(size) FROM public.files WHERE deleted_at IS NULL), 0)::BIGINT AS storage_bytes,
    (SELECT COUNT(*) FROM public.files WHERE deleted_at IS NULL)::BIGINT AS file_count,
    (SELECT COUNT(*) FROM public.profiles)::BIGINT AS user_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_usage() TO authenticated;
