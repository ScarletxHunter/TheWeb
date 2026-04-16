-- ============================================================
-- Migration 009: Per-user storage quota
-- Adds a quota_bytes column to profiles so admins can grant more
-- space to specific users without changing code.
-- Run this in your Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NOT NULL DEFAULT 1073741824; -- 1 GB

-- Allow site admins to update any profile's quota.
-- Self-update of role/quota is intentionally NOT allowed: a user
-- can't grant themselves more space.
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
