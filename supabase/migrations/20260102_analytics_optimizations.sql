-- [PHASE 18] Session Deduplication & Optimizations

-- 1. 세션 중복 방지: session_id에 UNIQUE 제약 조건 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_logs_session_id_unique'
    ) THEN
        ALTER TABLE public.session_logs 
        ADD CONSTRAINT session_logs_session_id_unique UNIQUE (session_id);
    END IF;
END $$;

-- 2. 이탈률 계산 정확도를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_session_logs_duration 
ON public.session_logs USING btree (duration_seconds) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_session_logs_clicks 
ON public.session_logs USING btree (total_clicks) TABLESPACE pg_default;

-- 3. 성능 최적화: 날짜별 집계 뷰
CREATE OR REPLACE VIEW analytics_daily_summary AS
SELECT 
    DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
    target_type,
    COUNT(DISTINCT CONCAT(COALESCE(user_id::text, ''), COALESCE(fingerprint, ''), target_id)) as unique_clicks,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND (is_admin IS NULL OR is_admin = false)) as unique_users,
    COUNT(DISTINCT fingerprint) FILTER (WHERE user_id IS NULL AND (is_admin IS NULL OR is_admin = false)) as unique_guests
FROM site_analytics_logs
WHERE is_admin IS NULL OR is_admin = false
GROUP BY 1, 2;

-- 4. Export를 위한 헬퍼 뷰
CREATE OR REPLACE VIEW analytics_export_view AS
SELECT 
    DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
    target_type,
    target_title,
    section,
    COUNT(*) as total_clicks,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
    COUNT(DISTINCT fingerprint) FILTER (WHERE user_id IS NULL) as unique_guests
FROM site_analytics_logs
WHERE is_admin IS NULL OR is_admin = false
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, 5 DESC;

COMMENT ON VIEW analytics_daily_summary IS '날짜별/타입별 집계 데이터 (성능 최적화용)';
COMMENT ON VIEW analytics_export_view IS 'CSV Export용 상세 데이터';
