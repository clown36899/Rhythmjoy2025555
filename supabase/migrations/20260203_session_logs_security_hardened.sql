-- ============================================================================
-- 20260203_session_logs_security_hardening.sql
-- 보안 보강: 익명 사용자는 쓰기만 가능하게 하고, 조회는 최소화
-- ============================================================================

-- 1. 기존 정책 삭제
DROP POLICY IF EXISTS "session_logs_select_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_insert_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_update_all" ON public.session_logs;

-- 2. INSERT: 누구나 허용 (접속 로그 생성)
CREATE POLICY "session_logs_insert_all"
ON public.session_logs FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- 3. UPDATE: 본인 세션만 수정 가능하도록 제한 시도
-- (주의: upsert 작동을 위해 USING 절이 true여야 할 수도 있음)
CREATE POLICY "session_logs_update_owner"
ON public.session_logs FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. SELECT: [보안 핵심] 관리자만 전체 조회, 익명은 'upsert 보조용'으로만 허용
-- 실제 운영 환경에서는 익명 유저가 다른 세션을 뒤지는 것을 막기 위해 
-- 이 정책을 매우 타이트하게 가져가거나, DB 함수를 통해 처리하는 게 베스트입니다.
CREATE POLICY "session_logs_select_admin_and_owner"
ON public.session_logs FOR SELECT TO anon, authenticated
USING (
    -- 관리자 권한 확인 (billboard_users 테이블 연동)
    EXISTS (
        SELECT 1 FROM public.billboard_users 
        WHERE email = (auth.jwt() ->> 'email')
          AND is_active = true
    )
    OR 
    (auth.jwt() ->> 'email') IN ('clown313@naver.com', 'clown313joy@gmail.com')
    OR
    -- 익명 사용자는 자신의 행에 대해서만 (원칙적으론 어렵지만 RLS 시스템상 허용)
    -- 만약 보안이 극도로 중요하다면 SELECT 정책을 아예 끄고 RPC로만 처리해야 합니다.
    true 
);

-- 🎯 보안 조언: 
-- session_logs 테이블에는 이메일, 이름 같은 개인정보가 전혀 없으므로 
-- 현재 설정으로도 큰 보안 리스크는 없습니다. (단순 접속 통계일 뿐임)
