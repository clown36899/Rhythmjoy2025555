-- [최종 해결] 엔드포인트 유니크 제약조건 강제 적용
-- 이 스크립트는 중복 데이터를 정리하고, 반드시 유니크 제약조건을 생성합니다.

DO $$ 
DECLARE 
    duplicate_count integer;
BEGIN
    RAISE NOTICE '=== 1. 중복 데이터 검사 및 정리 시작 ===';
    
    -- 중복 데이터 개수 확인
    SELECT count(*) INTO duplicate_count
    FROM public.user_push_subscriptions
    WHERE id NOT IN (
        SELECT id
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY updated_at DESC) as r_num
            FROM public.user_push_subscriptions
            WHERE endpoint IS NOT NULL
        ) t
        WHERE t.r_num = 1
    );

    RAISE NOTICE '삭제할 중복 데이터 수: %', duplicate_count;

    -- 중복 데이터 삭제
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
    
    RAISE NOTICE '중복 데이터 정리 완료.';

    -- 2. 제약조건 재생성
    RAISE NOTICE '=== 2. 제약조건 재생성 시작 ===';

    -- 기존 것들 삭제 (충돌 방지)
    ALTER TABLE public.user_push_subscriptions DROP CONSTRAINT IF EXISTS user_push_subscriptions_endpoint_key;
    DROP INDEX IF EXISTS idx_user_push_subscriptions_endpoint;
    DROP INDEX IF EXISTS idx_user_push_subscriptions_composite; -- 혹시 남아있을 수 있는 복합 인덱스

    -- ★ 핵심: 제약조건 생성
    ALTER TABLE public.user_push_subscriptions
    ADD CONSTRAINT user_push_subscriptions_endpoint_key UNIQUE (endpoint);
    
    RAISE NOTICE '제약조건 생성 완료 (user_push_subscriptions_endpoint_key)';

    -- 3. API 캐시 갱신
    NOTIFY pgrst, 'reload config';
    RAISE NOTICE 'API 스키마 캐시 갱신 요청 완료.';

END $$;
