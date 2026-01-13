-- [빌보드 관련 보안 수정]
-- Billboard 관련 테이블의 너무 개방적인(Permissive) 정책을 제거하고 관리자 전용으로 변경합니다.

-- 1. billboard_settings
ALTER TABLE public.billboard_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow update billboard settings" ON public.billboard_settings;
-- (이미 생성된 Admin write 정책이 있으므로, 잘못된 정책만 삭제하면 됩니다)


-- 2. billboard_user_settings
ALTER TABLE public.billboard_user_settings ENABLE ROW LEVEL SECURITY;

-- 기존의 개방적 정책 삭제
DROP POLICY IF EXISTS "Allow delete billboard settings" ON public.billboard_user_settings;
DROP POLICY IF EXISTS "Allow insert billboard settings" ON public.billboard_user_settings;
DROP POLICY IF EXISTS "Allow update billboard settings" ON public.billboard_user_settings;

-- 관리자만 조작 가능하게 변경 (혹은 사용자 본인만?)
-- 문맥상 'user_settings'이므로 본인 데이터는 본인이, 관리자는 전체 관리 가능한 형태가 일반적이나
-- 현재 경고를 없애기 위해 가장 안전한 '관리자 전용' 혹은 'Authenticated'로 변경합니다.
-- 일단은 안전하게 "읽기는 Public/Auth, 쓰기는 Admin" 패턴을 적용합니다.

CREATE POLICY "Public read billboard_user_settings" ON public.billboard_user_settings
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write billboard_user_settings" ON public.billboard_user_settings
    FOR ALL
    USING (public.is_admin_user() = true)
    WITH CHECK (public.is_admin_user() = true);


-- 3. billboard_users
ALTER TABLE public.billboard_users ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow delete billboard users" ON public.billboard_users;
DROP POLICY IF EXISTS "Allow insert billboard users" ON public.billboard_users;
DROP POLICY IF EXISTS "Allow update billboard users" ON public.billboard_users;

-- 새 정책 적용
CREATE POLICY "Public read billboard_users" ON public.billboard_users
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write billboard_users" ON public.billboard_users
    FOR ALL
    USING (public.is_admin_user() = true)
    WITH CHECK (public.is_admin_user() = true);
