-- Add Admin Read Policies for Favorites Tables
-- Created: 2025-12-23

-- 1. Event Favorites (Admins can view all)
-- (Assuming table exists, if RLS is not enabled, enable it just in case)
ALTER TABLE IF EXISTS event_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select all event favorites" ON event_favorites;
CREATE POLICY "Admins can select all event favorites"
  ON event_favorites FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM board_admins)
  );

-- 2. Practice Room Favorites
DROP POLICY IF EXISTS "Admins can select all practice favorites" ON practice_room_favorites;
CREATE POLICY "Admins can select all practice favorites"
  ON practice_room_favorites FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM board_admins)
  );

-- 3. Shop Favorites
DROP POLICY IF EXISTS "Admins can select all shop favorites" ON shop_favorites;
CREATE POLICY "Admins can select all shop favorites"
  ON shop_favorites FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM board_admins)
  );
