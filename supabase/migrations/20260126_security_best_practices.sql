-- 20260126_security_best_practices.sql
-- Supabase 보안 강화: 함수 경로 고정 및 RLS 정책 절대 원칙 적용 (실제 스키마 100% 반영)

-- 1. 함수 보안 강화 (Search Path를 public으로 고정하여 권한 상승 공격 방지)
ALTER FUNCTION public.is_admin_user() SET search_path = public;
ALTER FUNCTION public.suppress_views_realtime() SET search_path = public;
ALTER FUNCTION public.get_user_today_views(uuid) SET search_path = public;
ALTER FUNCTION public.get_analytics_summary_v2(text, text) SET search_path = public;
ALTER FUNCTION public.handle_user_withdrawal(uuid) SET search_path = public;
ALTER FUNCTION public.get_user_admin_status() SET search_path = public;

-- 2. 미비된 테이블 소유주 컬럼 추가 (등록자 식별용)
ALTER TABLE public.deployments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.crawling_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();

-- 3. RLS 정책 재설정 (관리자 전권 + 등록자 본인 데이터 한정)

-- [board_posts] 정책 (user_id: TEXT)
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_posts_admin_all" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_owner_update" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_owner_delete" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_select_public" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_insert_auth" ON public.board_posts;

CREATE POLICY "board_posts_admin_all" ON public.board_posts FOR ALL USING (public.is_admin_user());
CREATE POLICY "board_posts_owner_update" ON public.board_posts FOR UPDATE USING (user_id = auth.uid()::text);
CREATE POLICY "board_posts_owner_delete" ON public.board_posts FOR DELETE USING (user_id = auth.uid()::text);
CREATE POLICY "board_posts_select_public" ON public.board_posts FOR SELECT USING (true);
CREATE POLICY "board_posts_insert_auth" ON public.board_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- [events] 정책 (user_id: TEXT)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_admin_all" ON public.events;
DROP POLICY IF EXISTS "events_owner_modify" ON public.events;
DROP POLICY IF EXISTS "events_select_public" ON public.events;

CREATE POLICY "events_admin_all" ON public.events FOR ALL USING (public.is_admin_user());
CREATE POLICY "events_owner_modify" ON public.events FOR ALL TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "events_select_public" ON public.events FOR SELECT USING (true);

-- [board_users] 정책 (user_id: TEXT)
ALTER TABLE public.board_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_users_admin_all" ON public.board_users;
DROP POLICY IF EXISTS "board_users_owner_modify" ON public.board_users;
DROP POLICY IF EXISTS "board_users_select_public" ON public.board_users;

CREATE POLICY "board_users_admin_all" ON public.board_users FOR ALL USING (public.is_admin_user());
CREATE POLICY "board_users_owner_modify" ON public.board_users FOR ALL TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "board_users_select_public" ON public.board_users FOR SELECT USING (true);

-- [venues] 정책 (user_id: UUID)
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "venues_admin_all" ON public.venues;
DROP POLICY IF EXISTS "venues_owner_modify" ON public.venues;
DROP POLICY IF EXISTS "venues_select_public" ON public.venues;

CREATE POLICY "venues_admin_all" ON public.venues FOR ALL USING (public.is_admin_user());
CREATE POLICY "venues_owner_modify" ON public.venues FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "venues_select_public" ON public.venues FOR SELECT USING (is_active = true);

-- [shops] 정책 (user_id: UUID)
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_admin_all" ON public.shops;
DROP POLICY IF EXISTS "shops_owner_modify" ON public.shops;
DROP POLICY IF EXISTS "shops_select_public" ON public.shops;

CREATE POLICY "shops_admin_all" ON public.shops FOR ALL USING (public.is_admin_user());
CREATE POLICY "shops_owner_modify" ON public.shops FOR ALL TO authenticated USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "shops_select_public" ON public.shops FOR SELECT USING (true);

-- [deployments] 정책 (user_id: UUID)
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deployments_admin_all" ON public.deployments;
DROP POLICY IF EXISTS "deployments_owner_modify" ON public.deployments;
CREATE POLICY "deployments_admin_all" ON public.deployments FOR ALL USING (public.is_admin_user());
CREATE POLICY "deployments_owner_modify" ON public.deployments FOR ALL TO authenticated USING (user_id = auth.uid());

-- [crawling_events] 정책 (user_id: UUID)
ALTER TABLE public.crawling_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crawling_events_admin_all" ON public.crawling_events;
DROP POLICY IF EXISTS "crawling_events_owner_modify" ON public.crawling_events;
DROP POLICY IF EXISTS "crawling_events_select_public" ON public.crawling_events;
CREATE POLICY "crawling_events_admin_all" ON public.crawling_events FOR ALL USING (public.is_admin_user());
CREATE POLICY "crawling_events_owner_modify" ON public.crawling_events FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "crawling_events_select_public" ON public.crawling_events FOR SELECT USING (true);

-- [site_analytics_logs] 보안 강화
ALTER TABLE public.site_analytics_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analytics_insert_all" ON public.site_analytics_logs;
DROP POLICY IF EXISTS "analytics_admin_select" ON public.site_analytics_logs;

CREATE POLICY "analytics_insert_all" ON public.site_analytics_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_admin_select" ON public.site_analytics_logs FOR SELECT USING (public.is_admin_user());

-- 스키마 갱신 알림
NOTIFY pgrst, 'reload schema';
