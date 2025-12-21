-- Add user_id column to venues table
ALTER TABLE venues 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable RLS (if not already enabled)
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them with ownership logic
DROP POLICY IF EXISTS "venues_select_policy" ON venues;
DROP POLICY IF EXISTS "venues_insert_policy" ON venues;
DROP POLICY IF EXISTS "venues_update_policy" ON venues;
DROP POLICY IF EXISTS "venues_delete_policy" ON venues;

-- 1. SELECT: Everyone can view active venues
CREATE POLICY "venues_select_policy" ON venues 
  FOR SELECT 
  USING (is_active = true);

-- 2. INSERT: Authenticated users can insert
CREATE POLICY "venues_insert_policy" ON venues 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- 3. UPDATE: Owners or Admins can update
CREATE POLICY "venues_update_policy" ON venues 
  FOR UPDATE 
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM board_admins 
      WHERE user_id = auth.uid()
    )
  );

-- 4. DELETE: Owners or Admins can delete
CREATE POLICY "venues_delete_policy" ON venues 
  FOR DELETE 
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM board_admins 
      WHERE user_id = auth.uid()
    )
  );

-- Helper comment
COMMENT ON COLUMN venues.user_id IS 'The user who registered this venue';
