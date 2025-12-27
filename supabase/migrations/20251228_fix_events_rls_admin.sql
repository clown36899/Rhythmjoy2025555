-- Fix RLS policy for events to allow admins to update
-- Currently only user_id = auth.uid() is checked

-- 1. Drop existing update policy
DROP POLICY IF EXISTS "events_update_own_or_admin" ON events;

-- 2. Re-create policy with Admin check
CREATE POLICY "events_update_own_or_admin"
ON events FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()::text 
  OR 
  EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
);

-- 3. Also fix Delete policy just in case
DROP POLICY IF EXISTS "events_delete_own_or_admin" ON events;

CREATE POLICY "events_delete_own_or_admin"
ON events FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()::text 
  OR 
  EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
);
