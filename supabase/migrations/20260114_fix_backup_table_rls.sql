-- [추가 수정] 백업 테이블 보안 경고(Lint) 해결

-- 1. history_nodes_backup_v7 테이블 RLS 활성화
-- 백업 테이블이므로 공개 접근을 차단하고 RLS를 켭니다.
ALTER TABLE public.history_nodes_backup_v7 ENABLE ROW LEVEL SECURITY;

-- 2. 관리자 전용 접근 정책 추가 (일반 유저는 접근 불가)
DROP POLICY IF EXISTS "Enable all access for admins" ON public.history_nodes_backup_v7;
CREATE POLICY "Enable all access for admins" ON public.history_nodes_backup_v7
    FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        public.is_admin_user() = true OR
        (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    );
