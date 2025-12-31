-- Fix board_users RLS policy to allow INSERT for service_role
-- This resolves the "new row violates row-level security policy" error during Kakao login

-- Drop existing service role policy
DROP POLICY IF EXISTS "Service role full access" ON public.board_users;

-- Recreate with explicit ALL operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Service role full access" 
ON public.board_users 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Verify the policy is created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'board_users' 
ORDER BY policyname;
