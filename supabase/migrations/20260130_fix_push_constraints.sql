-- [긴급 수정] 400 Bad Request (42P10) 해결을 위한 종합 SQL
-- 이 스크립트는 다음을 보장합니다:
-- 1. endpoint 컬럼 존재 확인
-- 2. 중복 데이터 정리
-- 3. 명시적 Unique Constraint 설정
-- 4. Supabase API 스키마 캐시 새로고침 (중요)

DO $$ 
DECLARE 
    constraint_name text;
BEGIN
    ----------------------------------------------------------------
    -- 1. 컬럼 확인 (만약 없으면 생성)
    ----------------------------------------------------------------
    -- 기존에 subscription JSONB 내부에만 있고 컬럼이 없었을 가능성 대비
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_push_subscriptions' 
        AND column_name = 'endpoint'
    ) THEN
        ALTER TABLE public.user_push_subscriptions ADD COLUMN endpoint text;
        -- 기존 데이터 마이그레이션 (JSON -> Column)
        UPDATE public.user_push_subscriptions 
        SET endpoint = subscription->>'endpoint'
        WHERE endpoint IS NULL;
    END IF;

    ----------------------------------------------------------------
    -- 2. 기존 제약조건 및 인덱스 청소
    ----------------------------------------------------------------
    -- user_id 유니크 제약 제거
    SELECT con.conname INTO constraint_name
    FROM pg_catalog.pg_constraint con
    INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
    WHERE nsp.nspname = 'public' 
      AND rel.relname = 'user_push_subscriptions' 
      AND con.contype = 'u'
      AND 'user_id' = ANY (SELECT attname FROM pg_attribute WHERE attrelid = rel.oid AND attnum = ANY (con.conkey))
      AND array_length(con.conkey, 1) = 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.user_push_subscriptions DROP CONSTRAINT ' || constraint_name;
    END IF;

    -- 이외 충돌 가능한 인덱스/제약조건 이름 모두 제거
    DROP INDEX IF EXISTS idx_user_push_subscriptions_composite;
    DROP INDEX IF EXISTS idx_user_push_subscriptions_endpoint;
    ALTER TABLE public.user_push_subscriptions DROP CONSTRAINT IF EXISTS user_push_subscriptions_endpoint_key;

END $$;

----------------------------------------------------------------
-- 3. 중복 데이터 정리 (가장 최신 1개만 남김)
----------------------------------------------------------------
DELETE FROM public.user_push_subscriptions
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY updated_at DESC) as r_num
        FROM public.user_push_subscriptions
        WHERE endpoint IS NOT NULL -- NULL endpoint는 무시
    ) t
    WHERE t.r_num = 1
);

----------------------------------------------------------------
-- 4. 명시적 UNIQUE CONSTRAINT 추가 (API가 인식하도록)
----------------------------------------------------------------
ALTER TABLE public.user_push_subscriptions
ADD CONSTRAINT user_push_subscriptions_endpoint_key UNIQUE (endpoint);

----------------------------------------------------------------
-- 5. ★ API 스키마 캐시 새로고침 (매우 중요) ★
----------------------------------------------------------------
-- 구조가 바뀌었음을 Supabase API 서버에 알림
NOTIFY pgrst, 'reload config';
