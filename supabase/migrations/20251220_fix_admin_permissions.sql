-- 1. Ensure the recursion fix function exists (in case it wasn't run)
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM board_admins 
        WHERE user_id = auth.uid()
    );
$$;

-- 2. Allow Admins to UPDATE any post (for Hiding/Unhiding)
-- Existing policies likely only allow owners. adding a specific admin policy.
CREATE POLICY "Allow admin to update any post" ON board_posts
    FOR UPDATE
    USING (is_admin_user())
    WITH CHECK (is_admin_user());

-- 3. Also ensure they can DELETE if needed (optional but good)
CREATE POLICY "Allow admin to delete any post" ON board_posts
    FOR DELETE
    USING (is_admin_user());

-- 4. Verify board_categories policy again (ensure Update works)
DROP POLICY IF EXISTS "Allow admin full access" ON board_categories;
CREATE POLICY "Allow admin full access" ON board_categories
    FOR ALL
    USING (is_admin_user())
    WITH CHECK (is_admin_user());
