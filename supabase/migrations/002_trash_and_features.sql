-- ============================================================
-- Migration 002: Trash, Rename, Password-Protected Shares
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add deleted_at column to files for soft delete (trash)
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON public.files(deleted_at);

-- 2. Add password_hash column to share_links
ALTER TABLE public.share_links ADD COLUMN IF NOT EXISTS password_hash text DEFAULT NULL;

-- 3. Add UPDATE policy for files (needed for trash, rename, move)
CREATE POLICY "Admins can update files"
  ON public.files FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Update the anon file select policy to exclude trashed files
DROP POLICY IF EXISTS "Anon can view files for share links" ON public.files;
CREATE POLICY "Anon can view files for share links"
  ON public.files FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM public.share_links
      WHERE file_id = files.id
        AND (expires_at IS NULL OR expires_at > now())
    )
  );
