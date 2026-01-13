-- [긴급 수정] 라이브러리 접근 오류 해결을 위한 RLS 설정
-- 불필요한 함수 수정(ALTER FUNCTION)은 제거하고, 핵심인 RLS 설정만 적용합니다.

-- 1. learning_resources 테이블에 대한 보안 정책 활성화
ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_categories ENABLE ROW LEVEL SECURITY; -- 카테고리 테이블도 안전하게 활성화

-- 2. "모든 사용자 읽기 허용" 정책 추가
-- 아이폰/Safari에서 조인 시 권한 문제로 차단되는 것을 방지하기 위해 명시적으로 허용
DROP POLICY IF EXISTS "Enable read access for all users" ON public.learning_resources;
CREATE POLICY "Enable read access for all users" ON public.learning_resources
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.learning_categories;
CREATE POLICY "Enable read access for all users" ON public.learning_categories
    FOR SELECT
    USING (true);

-- 3. "관리자 모든 권한 허용" 정책 추가 (is_admin_user 함수 사용)
-- 서비스 롤(Service Role)과 관리자(Admin)에게 쓰기 권한 부여
DROP POLICY IF EXISTS "Enable all access for admins" ON public.learning_resources;
CREATE POLICY "Enable all access for admins" ON public.learning_resources
    FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        public.is_admin_user() = true OR
        (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    );

DROP POLICY IF EXISTS "Enable all access for admins" ON public.learning_categories;
CREATE POLICY "Enable all access for admins" ON public.learning_categories
    FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        public.is_admin_user() = true OR
        (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    );
