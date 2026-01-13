-- [종합 보안 수정] Lint 경고 일괄 해결 (Dynamic SQL 버전)
-- 1. Function Mutable Search Path 수정
-- 보안 모범 사례: 함수 실행 시 search_path를 public으로 고정하여 하이재킹 방지
-- 이전 버전 오류 수정: 함수 시그니처(인자 타입)를 추측하지 않고 시스템 카탈로그(pg_proc)에서 직접 조회하여 수정합니다.

DO $$
DECLARE
    target_funcs text[] := ARRAY[
        'update_updated_at_column',
        'get_board_user',
        'handle_anonymous_mutual_dislike',
        'update_history_nodes_updated_at',
        'register_board_user',
        'create_board_post',
        'update_timestamp',
        'create_usage_snapshot',
        'sync_post_likes',
        'handle_anonymous_mutual_like',
        'get_my_board_user',
        'get_all_board_users',
        'check_post_dislikes',
        'verify_post_password',
        'delete_post_with_password',
        'update_post_with_password',
        'get_board_static_data',
        'handle_anonymous_mutual_like_update',
        'toggle_anonymous_interaction',
        'update_post_favorites_count',
        'get_user_interactions',
        'update_board_post',
        'sync_anonymous_post_likes',
        'sync_anonymous_post_dislikes',
        'verify_anonymous_post_password',
        'nuke_policies',
        'sync_anonymous_comment_count',
        'delete_anonymous_post_with_password',
        'notify_board_post_changes',
        'suppress_views_update',
        'get_bootstrap_data',
        'sync_comment_counts',
        'increment_board_post_views',
        'update_anonymous_comment_with_password',
        'toggle_comment_interaction',
        'update_anonymous_post_with_password',
        'get_user_admin_status',
        'update_learning_updated_at',
        'update_social_event_with_password',
        'update_social_schedule_with_password',
        'update_billboard_settings_updated_at'
    ];
    func_name text;
    func_sig text;
BEGIN
    FOREACH func_name IN ARRAY target_funcs
    LOOP
        -- 해당 이름을 가진 모든 함수(오버로딩 포함)에 대해 반복
        FOR func_sig IN 
            SELECT oid::regprocedure::text 
            FROM pg_proc 
            WHERE proname = func_name 
              AND pg_function_is_visible(oid) -- 현재 search_path에서 접근 가능한 것만 (혹은 public 스키마 명시 가능)
        LOOP
            -- RAISE NOTICE 'Securing function: %', func_sig;
            EXECUTE 'ALTER FUNCTION ' || func_sig || ' SET search_path = public';
        END LOOP;
    END LOOP;
END $$;


-- 2. Dangerous RLS Policy Fixes (Too Permissive)
-- theme_settings: Anyone can update/delete -> Restrict to Admin
ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can delete theme_settings" ON public.theme_settings;
CREATE POLICY "Admin can delete theme_settings" ON public.theme_settings
    FOR DELETE
    USING (public.is_admin_user() = true);

DROP POLICY IF EXISTS "Anyone can update theme_settings" ON public.theme_settings;
CREATE POLICY "Admin can update theme_settings" ON public.theme_settings
    FOR UPDATE
    USING (public.is_admin_user() = true)
    WITH CHECK (public.is_admin_user() = true);

-- note: "Anyone can insert" might be needed for initial setup, but ideally restricted too.
DROP POLICY IF EXISTS "Anyone can insert theme_settings" ON public.theme_settings;
CREATE POLICY "Admin can insert theme_settings" ON public.theme_settings
    FOR INSERT
    WITH CHECK (public.is_admin_user() = true);


-- billboard_settings: likely global settings, restrict write to admin
ALTER TABLE public.billboard_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to billboard_settings" ON public.billboard_settings;
-- Split into Read (Public) and Write (Admin)
CREATE POLICY "Public read billboard_settings" ON public.billboard_settings
    FOR SELECT
    USING (true);

CREATE POLICY "Admin write billboard_settings" ON public.billboard_settings
    FOR ALL
    USING (public.is_admin_user() = true)
    WITH CHECK (public.is_admin_user() = true);
