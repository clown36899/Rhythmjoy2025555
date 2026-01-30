-- 기존 함수 제거 (파라미터 변경을 위해)
DROP FUNCTION IF EXISTS public.handle_push_subscription;

-- 새 파라미터(pref_clubs, pref_filter_class_genres) 추가하여 재생성
CREATE OR REPLACE FUNCTION public.handle_push_subscription(
    p_endpoint text,
    p_subscription jsonb,
    p_user_agent text,
    p_is_admin boolean,
    p_pref_events boolean,
    p_pref_lessons boolean,
    p_pref_clubs boolean, -- [NEW]
    p_pref_filter_tags text[],
    p_pref_filter_class_genres text[] -- [NEW]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.user_push_subscriptions (
        user_id, 
        endpoint, 
        subscription, 
        user_agent, 
        is_admin,
        pref_events, 
        pref_lessons, 
        pref_clubs, -- [NEW]
        pref_filter_tags, 
        pref_filter_class_genres, -- [NEW]
        updated_at
    )
    VALUES (
        v_user_id, 
        p_endpoint, 
        p_subscription, 
        p_user_agent,
        p_is_admin,
        p_pref_events, 
        p_pref_lessons, 
        p_pref_clubs, -- [NEW]
        p_pref_filter_tags,
        p_pref_filter_class_genres, -- [NEW]
        now()
    )
    ON CONFLICT (endpoint) 
    DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        subscription = EXCLUDED.subscription,
        user_agent = EXCLUDED.user_agent,
        is_admin = EXCLUDED.is_admin,
        pref_events = EXCLUDED.pref_events,
        pref_lessons = EXCLUDED.pref_lessons,
        pref_clubs = EXCLUDED.pref_clubs, -- [NEW]
        pref_filter_tags = EXCLUDED.pref_filter_tags,
        pref_filter_class_genres = EXCLUDED.pref_filter_class_genres, -- [NEW]
        updated_at = now();
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION public.handle_push_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_push_subscription TO service_role;
