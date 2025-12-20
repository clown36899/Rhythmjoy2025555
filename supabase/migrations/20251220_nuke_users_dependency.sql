-- Remove references to "users" table from board_prefixes to fix permission errors
-- This error happens if board_prefixes has a Foreign Key to a "users" table that authenticated users can't access

-- 1. Try to drop common Foreign Key names referencing users
ALTER TABLE board_prefixes DROP CONSTRAINT IF EXISTS board_prefixes_user_id_fkey;
ALTER TABLE board_prefixes DROP CONSTRAINT IF EXISTS board_prefixes_author_fkey;
ALTER TABLE board_prefixes DROP CONSTRAINT IF EXISTS board_prefixes_created_by_fkey;

-- 2. Grant explicit permissions to the table itself
GRANT SELECT, INSERT, UPDATE, DELETE ON board_prefixes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON board_prefixes TO service_role;

-- 3. Reset RLS policies to be absolutely minimal
ALTER TABLE board_prefixes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin full access" ON board_prefixes;
DROP POLICY IF EXISTS "Allow public read" ON board_prefixes;
DROP POLICY IF EXISTS "Allow all" ON board_prefixes;

-- Admin Policy (Depends ONLY on board_admins table)
CREATE POLICY "Allow admin full access" ON board_prefixes
    FOR ALL
    USING (
        auth.uid() IN (SELECT user_id FROM board_admins)
    );

-- Public Read Policy
CREATE POLICY "Allow public read" ON board_prefixes
    FOR SELECT USING (true);
