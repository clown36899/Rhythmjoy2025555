-- [Security Fix] Enable RLS on events table and setup policies
-- Purpose: Protect events table from unauthorized modification while keeping it public for reading.
-- Created: 2025-12-30

-- 1. Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "events_select_all" ON public.events;
DROP POLICY IF EXISTS "events_insert_authenticated" ON public.events;
DROP POLICY IF EXISTS "events_update_own_or_admin" ON public.events;
DROP POLICY IF EXISTS "events_delete_own_or_admin" ON public.events;
DROP POLICY IF EXISTS "Public can view events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "Owners or admins can update events" ON public.events;
DROP POLICY IF EXISTS "Owners or admins can delete events" ON public.events;

-- 3. Create robust policies

-- Everyone (anon/authenticated) can read events
CREATE POLICY "Public can view events"
ON public.events FOR SELECT
USING (true);

-- Authenticated users can create events
CREATE POLICY "Authenticated users can insert events"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (true);

-- Owners (user_id match) or Board Admins can update
CREATE POLICY "Owners or admins can update events"
ON public.events FOR UPDATE
TO authenticated
USING (
  auth.uid()::text = user_id 
  OR 
  EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
);

-- Owners (user_id match) or Board Admins can delete
CREATE POLICY "Owners or admins can delete events"
ON public.events FOR DELETE
TO authenticated
USING (
  auth.uid()::text = user_id 
  OR 
  EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
