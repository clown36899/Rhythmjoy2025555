-- [데이터 분석 결과에 기반한 팩트 체크 및 최종 수정안]
-- 1. 테이블 상태 확인: 'user_push_subscriptions'의 컬럼명은 'pref_class'입니다. (REST API 확인 완료)
-- 2. RPC 불일치: 현재 DB에 7개 또는 9개의 파라미터를 가진 함수들이 혼재되어 있어 'Function not found' 또는 'is not unique' 오류가 발생하고 있습니다.
-- 3. 내부 로직 오류: 기존 RPC 함수가 'pref_lessons' 컬럼에 입력하려고 하나, 실제 컬럼명은 'pref_class'이므로 내부적으로 오류가 발생합니다.

BEGIN;

-- 1. 중복/오버로딩된 모든 동명 함수 삭제 (모든 버전 청소)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'handle_push_subscription'
        AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_signature;
    END LOOP;
END $$;

-- 2. 'pref_class' 컬럼명과 프론트엔드 파라미터가 일치하도록 재생성
CREATE OR REPLACE FUNCTION public.handle_push_subscription(
    p_endpoint text,
    p_subscription jsonb,
    p_user_agent text,
    p_is_admin boolean,
    p_pref_events boolean,
    p_pref_class boolean, -- 파라미터명을 pref_class로 통일
    p_pref_clubs boolean,
    p_pref_filter_tags text[],
    p_pref_filter_class_genres text[]
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
        user_id, endpoint, subscription, user_agent, is_admin,
        pref_events, pref_class, pref_clubs, 
        pref_filter_tags, pref_filter_class_genres, updated_at
    )
    VALUES (
        v_user_id, p_endpoint, p_subscription, p_user_agent, p_is_admin,
        p_pref_events, p_pref_class, p_pref_clubs, 
        p_pref_filter_tags, p_pref_filter_class_genres, now()
    )
    ON CONFLICT (endpoint) 
    DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        subscription = EXCLUDED.subscription,
        user_agent = EXCLUDED.user_agent,
        is_admin = EXCLUDED.is_admin,
        pref_events = EXCLUDED.pref_events,
        pref_class = EXCLUDED.pref_class,
        pref_clubs = EXCLUDED.pref_clubs,
        pref_filter_tags = EXCLUDED.pref_filter_tags,
        pref_filter_class_genres = EXCLUDED.pref_filter_class_genres,
        updated_at = now();
END;
$$;

-- 3. 권한 재부여
GRANT EXECUTE ON FUNCTION public.handle_push_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_push_subscription TO service_role;

-- 4. PostgREST 캐시 갱신 알림
NOTIFY pgrst, 'reload config';

COMMIT;
