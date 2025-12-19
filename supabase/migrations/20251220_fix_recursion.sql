-- 1. Create a secure function to check admin status (Bypasses RLS)
-- This fixes the "infinite recursion" error by allowing policy to check status without triggering itself
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER -- Critical: runs with privileges of creator (postgres), bypassing RLS
SET search_path = public -- Security best practice
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM board_admins 
        WHERE user_id = auth.uid()
    );
$$;

-- 2. Update Policies to use the function instead of direct table query

-- board_admins: Allow read if user is in the list (using function)
DROP POLICY IF EXISTS "Allow admin manage access" ON board_admins;
CREATE POLICY "Allow admin manage access" ON board_admins
    FOR ALL USING (is_admin_user());

-- board_categories: Allow Admin Write (using function)
DROP POLICY IF EXISTS "Allow admin full access" ON board_categories;
CREATE POLICY "Allow admin full access" ON board_categories
    FOR ALL USING (is_admin_user());

-- (Public read is already fine)
