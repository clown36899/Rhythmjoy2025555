-- RLS 우회를 위한 Security Definer 함수 생성
-- 이 함수는 "Endpoint(기기)"를 기준으로 소유권을 현재 유저에게로 이전하거나, 새로 생성합니다.

CREATE OR REPLACE FUNCTION public.handle_push_subscription(
    p_endpoint text,
    p_subscription jsonb,
    p_user_agent text,
    p_is_admin boolean,
    p_pref_events boolean,
    p_pref_lessons boolean,
    p_pref_filter_tags text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- ★ 핵심: 호출자가 누구든, 이 함수는 작성자(관리자) 권한으로 실행됨
SET search_path = public -- 보안 권장사항
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    -- 로그인 체크
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Upsert 수행
    INSERT INTO public.user_push_subscriptions (
        user_id, 
        endpoint, 
        subscription, 
        user_agent, 
        is_admin,
        pref_events, 
        pref_lessons, 
        pref_filter_tags, 
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
        p_pref_filter_tags,
        now()
    )
    ON CONFLICT (endpoint) 
    DO UPDATE SET
        user_id = EXCLUDED.user_id,          -- ★ 소유권 이전! (A -> B)
        subscription = EXCLUDED.subscription,-- 정보 갱신
        user_agent = EXCLUDED.user_agent,
        is_admin = EXCLUDED.is_admin,
        pref_events = EXCLUDED.pref_events,
        pref_lessons = EXCLUDED.pref_lessons,
        pref_filter_tags = EXCLUDED.pref_filter_tags,
        updated_at = now();

END;
$$;
