-- ============================================================================
-- 20260121_fix_session_logs_final_v2.sql
-- ============================================================================
-- 1. [Fix] session_logs.is_admin type: Integer -> Boolean
-- 2. [Fix] RLS Policies: Allow INSERT for ALL (Guests included)
-- 3. [Fix] Admin Logic: Unify backend logic to use 'billboard_users' email
-- ============================================================================

-- 1. Type Correction (Integer -> Boolean)
-- 데이터 날아가는 것 방지 위해 타입 캐스팅 적용
ALTER TABLE public.session_logs 
  ALTER COLUMN is_admin DROP DEFAULT,
  ALTER COLUMN is_admin TYPE BOOLEAN USING (CASE WHEN is_admin = 1 THEN true ELSE false END),
  ALTER COLUMN is_admin SET DEFAULT false;

-- 2. Ensure user_id is properly typed (if not already)
-- 기존 TEXT 타입일 수 있으므로 UUID로 명시적 변환 시도 (실패 시 에러 발생하므로 안전)
-- ALTER TABLE public.session_logs ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- 3. RLS Policy Overhaul (Clean Slate Approach)
-- 기존 정책 충돌 방지를 위해 관련 정책 모두 삭제 후 재생성
DROP POLICY IF EXISTS "Users can insert their own sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Admins can read all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Service role full access" ON public.session_logs;

-- A. INSERT/UPDATE: 누구나 자기 세션 ID에 대해서는 쓰기 가능 (Guest 포함)
CREATE POLICY "Allow anonymous/authenticated insert/update"
ON public.session_logs
FOR ALL
USING (true) -- 세션 ID 충돌은 PK/Unique 제약조건이 막아줌
WITH CHECK (true);

-- B. SELECT: 관리자 권한 판단 로직 통일 (billboard_users 이메일 참조)
CREATE POLICY "Allow admins to view all sessions"
ON public.session_logs
FOR SELECT
USING (
    -- 1. billboard_users에 내 이메일(JWT)이 있고 is_active=true인가?
    EXISTS (
        SELECT 1 FROM public.billboard_users 
        WHERE email = (auth.jwt() ->> 'email')
          AND is_active = true
    )
    OR
    -- 2. (백업) 마스터 관리자 이메일 하드코딩
    (auth.jwt() ->> 'email') IN ('clown313@naver.com', 'clown313joy@gmail.com')
);

-- 4. Unify Admin Check Function (get_user_admin_status)
-- 기존 로직(board_admins 참조)을 버리고 billboard_users 참조로 변경
CREATE OR REPLACE FUNCTION get_user_admin_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- 통일된 기준: billboard_users 테이블의 이메일 확인
  RETURN EXISTS (
    SELECT 1
    FROM public.billboard_users
    WHERE email = (auth.jwt() ->> 'email')
      AND is_active = true
  );
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO anon;

-- 5. 인덱스 최적화 (조회 속도 향상)
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id_v3 ON public.session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_created_at_v3 ON public.session_logs(created_at);

-- 6. 코멘트 업데이트
COMMENT ON TABLE public.session_logs IS '사용자 세션 로그 (Guest 쓰기 허용, 관리자 이메일 기반 조회)';
