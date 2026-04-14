-- ============================================================
-- Migration 007: Allow file owners to update/delete their own files
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Admins can delete files" ON public.files;
DROP POLICY IF EXISTS "Admins can update files" ON public.files;

-- Recreate: admins OR file owner can delete
CREATE POLICY "Owners and admins can delete files"
  ON public.files FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Recreate: admins OR file owner can update (trash, rename, move)
CREATE POLICY "Owners and admins can update files"
  ON public.files FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
