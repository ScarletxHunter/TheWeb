-- ============================================================
-- Migration 006: Fix RLS circular dependency with SECURITY DEFINER functions
--
-- Problem: groups SELECT policy queried group_members, whose SELECT
-- policy queried groups back → infinite recursion → 500 errors.
--
-- Fix: Create SECURITY DEFINER helper functions that bypass RLS
-- when doing cross-table lookups, breaking the circular dependency.
-- ============================================================

-- 1. Create SECURITY DEFINER helper functions
--    These run as the function owner (postgres), bypassing RLS,
--    so they can query group_members/groups without triggering policy recursion.

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_creator(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = _group_id AND created_by = _user_id
  );
$$;

-- 2. Drop ALL existing policies on affected tables

-- groups
DROP POLICY IF EXISTS "Members can view their groups" ON public.groups;
DROP POLICY IF EXISTS "Members and creators can view their groups" ON public.groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
DROP POLICY IF EXISTS "Group admins can update groups" ON public.groups;
DROP POLICY IF EXISTS "Group admins can delete groups" ON public.groups;

-- group_members
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Members and creator can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;
DROP POLICY IF EXISTS "Group creator and admins can add members" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can remove members" ON public.group_members;

-- files
DROP POLICY IF EXISTS "Users can view own and group files" ON public.files;
DROP POLICY IF EXISTS "Users can view own trashed files" ON public.files;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON public.files;
DROP POLICY IF EXISTS "Owners and group admins can update files" ON public.files;
DROP POLICY IF EXISTS "Owners and group admins can delete files" ON public.files;
DROP POLICY IF EXISTS "Anon can view files for share links" ON public.files;

-- folders
DROP POLICY IF EXISTS "Users can view own and group folders" ON public.folders;
DROP POLICY IF EXISTS "Authenticated users can create folders" ON public.folders;
DROP POLICY IF EXISTS "Owners and group admins can update folders" ON public.folders;
DROP POLICY IF EXISTS "Owners and group admins can delete folders" ON public.folders;

-- 3. Recreate all policies using SECURITY DEFINER functions

-- === GROUPS ===

CREATE POLICY "Members and creators can view their groups"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    (created_by = auth.uid()) OR is_group_member(id, auth.uid())
  );

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Group admins can update groups"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (is_group_admin(id, auth.uid()));

CREATE POLICY "Group admins can delete groups"
  ON public.groups FOR DELETE
  TO authenticated
  USING (is_group_admin(id, auth.uid()));

-- === GROUP_MEMBERS ===

CREATE POLICY "Members and creator can view group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    is_group_creator(group_id, auth.uid())
    OR (user_id = auth.uid())
    OR is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Group creator and admins can add members"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    is_group_creator(group_id, auth.uid())
    OR is_group_admin(group_id, auth.uid())
  );

CREATE POLICY "Group admins can remove members"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    is_group_admin(group_id, auth.uid())
    OR (user_id = auth.uid())
  );

-- === FILES ===

CREATE POLICY "Users can view own and group files"
  ON public.files FOR SELECT
  TO authenticated
  USING (
    (deleted_at IS NULL) AND (
      (uploaded_by = auth.uid())
      OR (group_id IS NOT NULL AND is_group_member(group_id, auth.uid()))
    )
  );

CREATE POLICY "Users can view own trashed files"
  ON public.files FOR SELECT
  TO authenticated
  USING (
    (deleted_at IS NOT NULL) AND (uploaded_by = auth.uid())
  );

CREATE POLICY "Authenticated users can upload files"
  ON public.files FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Owners and group admins can update files"
  ON public.files FOR UPDATE
  TO authenticated
  USING (
    (uploaded_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_admin(group_id, auth.uid()))
  );

CREATE POLICY "Owners and group admins can delete files"
  ON public.files FOR DELETE
  TO authenticated
  USING (
    (uploaded_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_admin(group_id, auth.uid()))
  );

CREATE POLICY "Anon can view files for share links"
  ON public.files FOR SELECT
  TO anon, authenticated
  USING (
    (deleted_at IS NULL) AND EXISTS (
      SELECT 1 FROM public.share_links
      WHERE share_links.file_id = files.id
        AND (share_links.expires_at IS NULL OR share_links.expires_at > now())
    )
  );

-- === FOLDERS ===

CREATE POLICY "Users can view own and group folders"
  ON public.folders FOR SELECT
  TO authenticated
  USING (
    (created_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_member(group_id, auth.uid()))
  );

CREATE POLICY "Authenticated users can create folders"
  ON public.folders FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners and group admins can update folders"
  ON public.folders FOR UPDATE
  TO authenticated
  USING (
    (created_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_admin(group_id, auth.uid()))
  );

CREATE POLICY "Owners and group admins can delete folders"
  ON public.folders FOR DELETE
  TO authenticated
  USING (
    (created_by = auth.uid())
    OR (group_id IS NOT NULL AND is_group_admin(group_id, auth.uid()))
  );

-- 4. Clean up orphaned groups (groups with no members)
DELETE FROM public.groups
WHERE id NOT IN (SELECT DISTINCT group_id FROM public.group_members);
