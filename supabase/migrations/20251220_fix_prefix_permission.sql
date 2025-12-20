-- Fix permission denied error by replacing policies logic with board_admins
-- We rely on board_admins table which we know exists and is accessible for checks

ALTER TABLE board_prefixes ENABLE ROW LEVEL SECURITY;

-- Remove explicit named policies if they match common patterns or prev attempts
DROP POLICY IF EXISTS "Allow admin insert" ON board_prefixes;
DROP POLICY IF EXISTS "Allow admin update" ON board_prefixes;
DROP POLICY IF EXISTS "Allow admin delete" ON board_prefixes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON board_prefixes;
DROP POLICY IF EXISTS "Allow admin full access" ON board_prefixes;

-- Create correct admin policy using board_admins table
-- This avoids referencing 'users' or 'auth.users' directly which causes permission issues
CREATE POLICY "Allow admin full access" ON board_prefixes
    FOR ALL
    USING (
        auth.uid() IN (SELECT user_id FROM board_admins)
    );

-- Ensure public read still works
DROP POLICY IF EXISTS "Allow public read" ON board_prefixes;
CREATE POLICY "Allow public read" ON board_prefixes
    FOR SELECT USING (true);
