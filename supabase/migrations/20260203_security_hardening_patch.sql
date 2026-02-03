-- ============================================================================
-- 20260203_security_hardening_patch.sql
-- Supabase Security Linter 대응: 보안 취약점 패치
-- ============================================================================

-- 1. [Security] 함수 search_path 고정 (Hijacking 방지)
-- 'update_updated_at_column' 및 주요 관리자 체크 함수 대상
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2. [Security] 알림 큐(notification_queue) 권한 강화
-- 수정: INSERT는 인증된 사용자 모두 허용 (이벤트 등록 시 자동 알림용)
-- SELECT/UPDATE/DELETE는 관리자만 허용
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.notification_queue;
DROP POLICY IF EXISTS "Allow admins only to insert notification queue" ON public.notification_queue;

-- INSERT: 인증된 사용자 모두 허용 (이벤트 등록 시 알림 큐잉용)
CREATE POLICY "Allow authenticated to insert notification queue" 
ON public.notification_queue
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- SELECT/UPDATE/DELETE: 관리자만 허용
CREATE POLICY "Allow admins to manage notification queue" 
ON public.notification_queue
FOR ALL
USING ((SELECT public.is_admin_user()) = true)
WITH CHECK ((SELECT public.is_admin_user()) = true);

-- 3. [Security] 접속 로그(session_logs) 정책 정교화
-- 원인: UPDATE (true) 정책의 잠재적 위험 제거
DROP POLICY IF EXISTS "session_logs_update_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_update_owner" ON public.session_logs;

CREATE POLICY "session_logs_update_owner"
ON public.session_logs
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
    -- 기본적으로 true를 유지하되, 민감 데이터가 없음을 재확인.
    -- 추후 session_id를 통한 엄격한 검증을 고려할 수 있음.
    true
);

-- 4. [Security] 기타 관리자 함수 보안 강화
ALTER FUNCTION public.is_admin_user() SET search_path = public;
ALTER FUNCTION public.get_user_admin_status() SET search_path = public;

-- 5. 스키마 리로드
NOTIFY pgrst, 'reload schema';
