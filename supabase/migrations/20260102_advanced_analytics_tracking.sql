-- [PHASE 15-17] Advanced Analytics: Referrer, Session, User Journey
-- 유입 경로, 이탈률, 사용자 여정 추적을 위한 DB 스키마 확장

-- 1. site_analytics_logs 테이블에 추가 컬럼
ALTER TABLE public.site_analytics_logs 
ADD COLUMN IF NOT EXISTS session_id TEXT,
ADD COLUMN IF NOT EXISTS sequence_number INTEGER,
ADD COLUMN IF NOT EXISTS referrer TEXT,
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS landing_page TEXT,
ADD COLUMN IF NOT EXISTS page_url TEXT;

-- 2. 세션 로그 테이블 생성
CREATE TABLE IF NOT EXISTS public.session_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    user_id TEXT,
    fingerprint TEXT,
    is_admin INTEGER DEFAULT 0,
    session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end TIMESTAMPTZ,
    page_views INTEGER DEFAULT 0,
    total_clicks INTEGER DEFAULT 0,
    entry_page TEXT,
    exit_page TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
) TABLESPACE pg_default;

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_analytics_session_id 
ON public.site_analytics_logs USING btree (session_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_analytics_page_url 
ON public.site_analytics_logs USING btree (page_url) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_session_logs_session_id 
ON public.session_logs USING btree (session_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_session_logs_start 
ON public.session_logs USING btree (session_start) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_session_logs_user_id 
ON public.session_logs USING btree (user_id) TABLESPACE pg_default;

-- 4. RLS 정책 (관리자만 조회 가능)
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sessions"
ON public.session_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Service role full access to sessions"
ON public.session_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. 코멘트
COMMENT ON TABLE public.session_logs IS '사용자 세션 추적 (유입 경로, 이탈률, 체류 시간)';
COMMENT ON COLUMN public.session_logs.session_id IS '클라이언트 생성 세션 UUID';
COMMENT ON COLUMN public.session_logs.duration_seconds IS '세션 지속 시간 (초)';
COMMENT ON COLUMN public.session_logs.entry_page IS '첫 방문 페이지';
COMMENT ON COLUMN public.session_logs.exit_page IS '마지막 방문 페이지';
COMMENT ON COLUMN public.session_logs.referrer IS '유입 경로 (document.referrer)';
