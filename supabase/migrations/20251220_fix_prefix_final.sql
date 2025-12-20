-- Comprehensive fix for board_prefixes permissions
-- 1. Attempt to grant permissions on public.users explicitly
-- If this fails with "relation does not exist", it implies public.users is missing, 
-- but the runtime error "permission denied" suggests it exists.
DO $$ 
BEGIN
    GRANT SELECT ON TABLE public.users TO authenticated;
    GRANT SELECT ON TABLE public.users TO service_role;
EXCEPTION WHEN undefined_table THEN
    -- Do nothing if table doesn't exist
    RAISE NOTICE 'Table public.users does not exist, skipping GRANT';
END $$;

-- 2. Reset RLS on board_prefixes
ALTER TABLE board_prefixes ENABLE ROW LEVEL SECURITY;

-- 3. Drop ALL known potential policy names to ensure no conflicting old policies remain
DROP POLICY IF EXISTS "Allow public read" ON board_prefixes;
DROP POLICY IF EXISTS "Allow admin full access" ON board_prefixes;
DROP POLICY IF EXISTS "Enable read access for all users" ON board_prefixes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON board_prefixes;
DROP POLICY IF EXISTS "Enable update for users based on email" ON board_prefixes;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON board_prefixes;
DROP POLICY IF EXISTS "Enable read access for all" ON board_prefixes;
DROP POLICY IF EXISTS "Enable write access for admins" ON board_prefixes;

-- 4. Re-create robust policies using board_admins (no dependency on users table)
CREATE POLICY "Allow admin full access" ON board_prefixes
    FOR ALL
    USING (
        auth.uid() IN (SELECT user_id FROM board_admins)
    );

CREATE POLICY "Allow public read" ON board_prefixes
    FOR SELECT USING (true);
