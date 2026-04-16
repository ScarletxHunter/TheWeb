-- ============================================================
-- Migration 008: Restore group-admin update/delete on files
-- Migration 007 dropped the group-aware policies from 006, which
-- broke bulk trash/delete for files inside groups (RLS silently
-- rejected files not uploaded by the current user).
-- Run this in your Supabase SQL Editor.
-- ============================================================

DROP POLICY IF EXISTS "Owners and admins can delete files" ON public.files;
DROP POLICY IF EXISTS "Owners and admins can update files" ON public.files;
DROP POLICY IF EXISTS "Owners and group admins can delete files" ON public.files;
DROP POLICY IF EXISTS "Owners and group admins can update files" ON public.files;

CREATE POLICY "Owners and group admins can update files"
  ON public.files FOR UPDATE
  TO authenticated
  USING (
    (uploaded_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_admin(group_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Owners and group admins can delete files"
  ON public.files FOR DELETE
  TO authenticated
  USING (
    (uploaded_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_admin(group_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
