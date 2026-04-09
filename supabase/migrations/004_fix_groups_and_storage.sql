-- ============================================================
-- Migration 004: Fix Groups RLS + Storage Policies
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Fix groups SELECT policy - creators must be able to see their own groups
--    (Previously, only group_members could see groups, but the creator
--     isn't added as a member until AFTER the insert, causing a deadlock)
DROP POLICY IF EXISTS "Members can view their groups" ON public.groups;
CREATE POLICY "Members and creators can view their groups"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = groups.id AND user_id = auth.uid()
    )
  );

-- 2. Fix storage bucket policies for vault-files
--    Allow ALL authenticated users to upload/download/delete (not just admins)
--    Drop any existing policies first (names may vary if set via UI)

-- Drop all possible existing storage policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
      AND policyname ILIKE '%vault%'
       OR (tablename = 'objects' AND schemaname = 'storage'
           AND policyname ILIKE '%upload%')
       OR (tablename = 'objects' AND schemaname = 'storage'
           AND policyname ILIKE '%download%')
       OR (tablename = 'objects' AND schemaname = 'storage'
           AND policyname ILIKE '%admin%'
           AND policyname NOT ILIKE '%profile%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Create clean storage policies
CREATE POLICY "vault_authenticated_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vault-files');

CREATE POLICY "vault_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'vault-files');

CREATE POLICY "vault_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vault-files');

CREATE POLICY "vault_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vault-files');

-- Also allow anon to download (for share links)
CREATE POLICY "vault_anon_select"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'vault-files');
