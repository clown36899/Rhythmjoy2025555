-- [PHASE 10] RLS Policy for board_users (Analytics User List)
-- 관리자가 analytics 모달에서 사용자 목록을 볼 수 있도록 허용

-- board_users 테이블에 SELECT 권한 추가 (관리자만)
CREATE POLICY "Admins can view all users for analytics"
ON public.board_users
FOR SELECT
TO authenticated
USING (
    public.is_admin()
);
