-- 업계 표준 (Industry Standard) 구현: "기기(Endpoint) 중심의 유니크 정책"
-- 1. 한 유저는 여러 기기를 가질 수 있다. (Endpoints X, Y, Z...) -> 허용
-- 2. 한 기기(Endpoint)는 동시에 한 유저만의 것이다. (Privacy)
--    -> A가 쓰던 폰을 B가 쓰면, 알림권한은 B에게 넘어오고 A는 끊겨야 함.

DO $$ 
DECLARE 
    constraint_name text;
BEGIN
    -- 1. 기존의 잘못된 제약조건 (user_id ONLY Unique, user_id+endpoint 복합 Unique 등) 모두 제거
    
    -- user_id 유니크 찾기
    SELECT con.conname INTO constraint_name
    FROM pg_catalog.pg_constraint con
    INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'user_push_subscriptions' AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1 -- 컬럼 1개짜리
    AND 'user_id' = ANY (SELECT attname FROM pg_attribute WHERE attrelid = rel.oid AND attnum = ANY (con.conkey));

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.user_push_subscriptions DROP CONSTRAINT ' || constraint_name;
    END IF;

    -- endpoint 유니크 찾기 (이미 있을 수 있음)
    SELECT con.conname INTO constraint_name
    FROM pg_catalog.pg_constraint con
    INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'user_push_subscriptions' AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND 'endpoint' = ANY (SELECT attname FROM pg_attribute WHERE attrelid = rel.oid AND attnum = ANY (con.conkey));
    
    -- 있으면 일단 냅두거나, 명확히 하기 위해 드랍 후 재생성 (여기선 없을 확률이 높으니 패스)
END $$;

-- 2. Endpoint 중복 데이터 정리 (가장 최신 것만 남기고 삭제)
-- (Endpoint를 Unique로 만들기 위해 필수)
DELETE FROM public.user_push_subscriptions
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY updated_at DESC) as r_num
        FROM public.user_push_subscriptions
    ) t
    WHERE t.r_num = 1
);

-- 3. Endpoint에 유니크 제약조건 생성 (Standard)
-- 이제 'insert' 하려다가 'endpoint'가 겹치면 -> 에러 발생 -> upsert로 처리하면 됨.
DROP INDEX IF EXISTS idx_user_push_subscriptions_composite; -- 이전 단계의 잔재 삭제
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_push_subscriptions_endpoint ON public.user_push_subscriptions (endpoint);
