-- ============================================================
-- Migration 005: Fix group_members INSERT policy
-- The previous policy used a self-referential subquery that fails
-- because no members exist yet when the group creator tries to
-- add themselves as the first member.
-- Fix: Allow the group creator (groups.created_by) to insert members.
-- ============================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;

-- New policy: group creator OR existing group admins can add members
CREATE POLICY "Group creator and admins can add members"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- The group creator can always add members
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_members.group_id AND created_by = auth.uid()
    )
    -- OR existing group admins can add members
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
    )
  );

-- Also fix: group_members SELECT policy has same self-referential issue
-- (members can't see themselves until they exist)
-- Allow group creator to always see members
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;

CREATE POLICY "Members and creator can view group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    -- Group creator can always see members
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_members.group_id AND created_by = auth.uid()
    )
    -- OR existing members can see other members
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

-- Also clean up any orphaned groups from failed creation attempts
-- (groups that exist but have no members)
DELETE FROM public.groups
WHERE id NOT IN (SELECT DISTINCT group_id FROM public.group_members);
