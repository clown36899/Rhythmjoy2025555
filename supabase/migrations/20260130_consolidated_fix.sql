-- [종합 해결 SQL] 푸시 알림 관련 모든 문제(컬럼, RPC, 권한, 제약조건)를 한 번에 해결합니다.
-- 이 스크립트를 실행하면 이전의 개별 마이그레이션을 모두 포함하므로 이것 하나만 실행하면 됩니다.

BEGIN;

-- 1. 새로운 컬럼 추가 (Safe Add)
ALTER TABLE public.user_push_subscriptions 
ADD COLUMN IF NOT EXISTS endpoint text,
ADD COLUMN IF NOT EXISTS pref_clubs boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pref_filter_class_genres text[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pref_filter_tags text[] DEFAULT NULL;

-- 2. 중복 데이터 정리 및 유니크 제약조건 강제 설정
DO $$ 
BEGIN
    -- 중복 데이터 삭제 (최신 데이터 유지)
    DELETE FROM public.user_push_subscriptions
    WHERE id NOT IN (
        SELECT id
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY updated_at DESC) as r_num
            FROM public.user_push_subscriptions
            WHERE endpoint IS NOT NULL
        ) t
        WHERE t.r_num = 1
    );

    -- 기존 제약조건 청소
    ALTER TABLE public.user_push_subscriptions DROP CONSTRAINT IF EXISTS user_push_subscriptions_endpoint_key;
    DROP INDEX IF EXISTS idx_user_push_subscriptions_endpoint;

    -- 유니크 제약조건 생성
    ALTER TABLE public.user_push_subscriptions
    ADD CONSTRAINT user_push_subscriptions_endpoint_key UNIQUE (endpoint);
END $$;

-- 3. RLS(보안 정책) 재설정
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 (충돌 방지)
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.user_push_subscriptions;

-- 새 정책 생성
CREATE POLICY "Users can view their own subscriptions" ON public.user_push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscriptions" ON public.user_push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscriptions" ON public.user_push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own subscriptions" ON public.user_push_subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all subscriptions" ON public.user_push_subscriptions FOR SELECT USING (
  (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true OR auth.email() = 'clown313@naver.com'
);

GRANT ALL ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;

-- 4. RPC 함수 (handle_push_subscription) 업데이트
-- [중요] 함수 오버로딩으로 인한 "is not unique" 오류 방지를 위해 기존 함수를 모두 삭제합니다.
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

CREATE OR REPLACE FUNCTION public.handle_push_subscription(
    p_endpoint text,
    p_subscription jsonb,
    p_user_agent text,
    p_is_admin boolean,
    p_pref_events boolean,
    p_pref_lessons boolean,
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
        pref_events, pref_lessons, pref_clubs, 
        pref_filter_tags, pref_filter_class_genres, updated_at
    )
    VALUES (
        v_user_id, p_endpoint, p_subscription, p_user_agent, p_is_admin,
        p_pref_events, p_pref_lessons, p_pref_clubs, 
        p_pref_filter_tags, p_pref_filter_class_genres, now()
    )
    ON CONFLICT (endpoint) 
    DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        subscription = EXCLUDED.subscription,
        user_agent = EXCLUDED.user_agent,
        is_admin = EXCLUDED.is_admin,
        pref_events = EXCLUDED.pref_events,
        pref_lessons = EXCLUDED.pref_lessons,
        pref_clubs = EXCLUDED.pref_clubs,
        pref_filter_tags = EXCLUDED.pref_filter_tags,
        pref_filter_class_genres = EXCLUDED.pref_filter_class_genres,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_push_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_push_subscription TO service_role;

COMMIT;

-- 5. API 캐시 갱신 (트랜잭션 밖에서 실행해야 안전할 수 있음, 하지만 Notify는 트랜잭션 내에서도 동작)
NOTIFY pgrst, 'reload config';
