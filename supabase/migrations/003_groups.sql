-- ============================================================
-- Migration 003: Groups, Personal Spaces, Open Uploads
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create groups table
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  avatar_color text NOT NULL DEFAULT '#6366f1',
  created_by uuid REFERENCES public.profiles ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Create group_members table
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid REFERENCES public.groups ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 3. Add group_id to files and folders
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups ON DELETE SET NULL DEFAULT NULL;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups ON DELETE SET NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_files_group_id ON public.files(group_id);
CREATE INDEX IF NOT EXISTS idx_folders_group_id ON public.folders(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);

-- 4. Enable RLS on new tables
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- 5. Groups policies - members can view their groups
CREATE POLICY "Members can view their groups"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = groups.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Group admins can update groups"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Group admins can delete groups"
  ON public.groups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Group members policies
CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can add members"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_members.group_id
    )
  );

CREATE POLICY "Group admins can remove members"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
    )
    OR user_id = auth.uid()
  );

-- 7. Update file policies - users see own files + group files
DROP POLICY IF EXISTS "Authenticated users can view files" ON public.files;
DROP POLICY IF EXISTS "Authenticated users can view active files" ON public.files;
DROP POLICY IF EXISTS "Admins can view trashed files" ON public.files;

CREATE POLICY "Users can view own and group files"
  ON public.files FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      uploaded_by = auth.uid()
      OR (
        group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.group_members
          WHERE group_id = files.group_id AND user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can view own trashed files"
  ON public.files FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NOT NULL AND uploaded_by = auth.uid()
  );

-- 8. All authenticated users can upload files (not just admins)
DROP POLICY IF EXISTS "Admins can upload files" ON public.files;
CREATE POLICY "Authenticated users can upload files"
  ON public.files FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- 9. Owners and group admins can update/delete files
DROP POLICY IF EXISTS "Admins can update files" ON public.files;
CREATE POLICY "Owners and group admins can update files"
  ON public.files FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = files.group_id AND user_id = auth.uid() AND role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete files" ON public.files;
CREATE POLICY "Owners and group admins can delete files"
  ON public.files FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = files.group_id AND user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- 10. Update folder policies
DROP POLICY IF EXISTS "Authenticated users can view folders" ON public.folders;
CREATE POLICY "Users can view own and group folders"
  ON public.folders FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = folders.group_id AND user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins can create folders" ON public.folders;
CREATE POLICY "Authenticated users can create folders"
  ON public.folders FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Admins can update folders" ON public.folders;
CREATE POLICY "Owners and group admins can update folders"
  ON public.folders FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = folders.group_id AND user_id = auth.uid() AND role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete folders" ON public.folders;
CREATE POLICY "Owners and group admins can delete folders"
  ON public.folders FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = folders.group_id AND user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- 11. Update share links - owners can create share links for their files
DROP POLICY IF EXISTS "Admins can create share links" ON public.share_links;
CREATE POLICY "File owners can create share links"
  ON public.share_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.files
      WHERE id = file_id AND (
        uploaded_by = auth.uid()
        OR (group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.group_members
          WHERE group_id = files.group_id AND user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete share links" ON public.share_links;
CREATE POLICY "Link creators can delete share links"
  ON public.share_links FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- 12. Update storage bucket policy to allow all authenticated uploads
-- (This also needs to be updated in the Supabase Storage UI)
-- The existing "Admins can upload files" storage policy needs to be
-- replaced with one that allows all authenticated users.
