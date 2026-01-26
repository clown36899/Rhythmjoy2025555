-- 20260126_security_hardening_v2.sql
-- Supabase 보안 강화 2단계: Linter 잔여 경고 완벽 해결 (실제 스키마 기반)

-- [1] 함수 보안 강화 (Search Path를 public으로 고정)
ALTER FUNCTION public.get_table_constraints(text) SET search_path = public;
ALTER FUNCTION public.handle_title_change_tags() SET search_path = public;

-- [2] RLS 정책 정교화: 무분별한 INSERT/UPDATE 차단

-- [board_anonymous_comments] (password 존재)
ALTER TABLE public.board_anonymous_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert anonymous comments" ON public.board_anonymous_comments;
CREATE POLICY "board_anon_comments_insert_role" ON public.board_anonymous_comments FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- [board_anonymous_posts] (password 존재)
ALTER TABLE public.board_anonymous_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert anonymous posts" ON public.board_anonymous_posts;
CREATE POLICY "board_anon_posts_insert_role" ON public.board_anonymous_posts FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- [board_comments] (user_id: UUID)
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert comments" ON public.board_comments;
CREATE POLICY "board_comments_insert_auth" ON public.board_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- [board_post_dislikes] (user_id: UUID)
ALTER TABLE public.board_post_dislikes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert dislikes" ON public.board_post_dislikes;
CREATE POLICY "board_post_dislikes_insert_role" ON public.board_post_dislikes FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- [board_post_views] (user_id: UUID)
ALTER TABLE public.board_post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert views" ON public.board_post_views;
CREATE POLICY "board_post_views_insert_role" ON public.board_post_views FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- [board_posts] (1차 보강)
DROP POLICY IF EXISTS "Anyone can create posts" ON public.board_posts;

-- [board_users] (user_id: TEXT)
DROP POLICY IF EXISTS "board_users_insert_master" ON public.board_users;
CREATE POLICY "board_users_insert_self_or_admin" ON public.board_users FOR INSERT WITH CHECK (auth.uid()::text = user_id OR public.is_admin_user());

-- [crawl_history] (Admin Only)
ALTER TABLE public.crawl_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for anon" ON public.crawl_history;
CREATE POLICY "crawl_history_admin_all" ON public.crawl_history FOR ALL USING (public.is_admin_user());

-- [crawling_events] (Admin Only)
DROP POLICY IF EXISTS "Enable insert for anon/public" ON public.crawling_events;
DROP POLICY IF EXISTS "Enable update for anon" ON public.crawling_events;

-- [deployments] (Service Role/Admin Only)
DROP POLICY IF EXISTS "Allow service role to delete deployments" ON public.deployments;
DROP POLICY IF EXISTS "Allow service role to insert deployments" ON public.deployments;
DROP POLICY IF EXISTS "Allow service role to update deployments" ON public.deployments;

-- [featured_items] (Admin Only)
ALTER TABLE public.featured_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable delete for featured items" ON public.featured_items;
DROP POLICY IF EXISTS "Enable update for featured items" ON public.featured_items;
CREATE POLICY "featured_items_admin_all" ON public.featured_items FOR ALL USING (public.is_admin_user());

-- [history_edges] (created_by: UUID)
ALTER TABLE public.history_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can create edges" ON public.history_edges;
CREATE POLICY "history_edges_insert_owner" ON public.history_edges FOR INSERT WITH CHECK (auth.uid() = created_by OR public.is_admin_user());

-- [history_nodes] (created_by: UUID)
ALTER TABLE public.history_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can create nodes" ON public.history_nodes;
CREATE POLICY "history_nodes_insert_owner" ON public.history_nodes FOR INSERT WITH CHECK (auth.uid() = created_by OR public.is_admin_user());

-- [item_views] (user_id: UUID)
ALTER TABLE public.item_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert views" ON public.item_views;
CREATE POLICY "item_views_insert_role" ON public.item_views FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- [learning_categories] (user_id: UUID)
ALTER TABLE public.learning_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.learning_categories;
CREATE POLICY "learning_categories_admin_all" ON public.learning_categories FOR ALL USING (public.is_admin_user());
CREATE POLICY "learning_categories_owner_modify" ON public.learning_categories FOR ALL TO authenticated USING (user_id = auth.uid());

-- [pwa_installs] (user_id: UUID)
ALTER TABLE public.pwa_installs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert their own PWA installs" ON public.pwa_installs;
CREATE POLICY "pwa_installs_insert_owner" ON public.pwa_installs FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- [session_logs] (user_id: TEXT)
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow individual session logging" ON public.session_logs;
CREATE POLICY "session_logs_insert_role" ON public.session_logs FOR INSERT WITH CHECK (auth.role() IS NOT NULL);
CREATE POLICY "session_logs_owner_modify" ON public.session_logs FOR ALL TO authenticated USING (user_id = auth.uid()::text);

-- [social_groups] (user_id: TEXT)
ALTER TABLE public.social_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_groups_insert_master" ON public.social_groups;
CREATE POLICY "social_groups_admin_all" ON public.social_groups FOR ALL USING (public.is_admin_user());
CREATE POLICY "social_groups_owner_modify" ON public.social_groups FOR ALL TO authenticated USING (user_id = auth.uid()::text);

-- [social_schedules] (user_id: TEXT)
ALTER TABLE public.social_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_schedules_insert_master" ON public.social_schedules;
CREATE POLICY "social_schedules_admin_all" ON public.social_schedules FOR ALL USING (public.is_admin_user());
CREATE POLICY "social_schedules_owner_modify" ON public.social_schedules FOR ALL TO authenticated USING (user_id = auth.uid()::text);

-- [site_analytics_logs] (1차 보강)
DROP POLICY IF EXISTS "Allow individual insert for everyone" ON public.site_analytics_logs;

-- [learning_video_bookmarks] (user_id 없음 - 관리자 전용으로 일단 보호)
ALTER TABLE public.learning_video_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users to update bookmarks" ON public.learning_video_bookmarks;
CREATE POLICY "learning_video_bookmarks_admin_all" ON public.learning_video_bookmarks FOR ALL USING (public.is_admin_user());
CREATE POLICY "learning_video_bookmarks_select_public" ON public.learning_video_bookmarks FOR SELECT USING (true);

-- 스키마 갱신 알림
NOTIFY pgrst, 'reload schema';
