-- 1. [NEW] 사이트 분석 로그 테이블 (성능을 위해 PK를 bigserial로 설정)
CREATE TABLE IF NOT EXISTS public.site_analytics_logs (
    id bigserial PRIMARY KEY,
    target_id text NOT NULL,                    -- 클릭된 아이템 ID
    target_type text NOT NULL,                  -- event, shop, venue, social, group 등
    target_title text,                          -- 클릭된 아이템 제목 (편의상 기록)
    section text NOT NULL,                      -- 클릭 지점 (today_social, upcoming 등)
    category text,                              -- 세부 카테고리
    route text,                                 -- 발생 페이지 경로
    user_id uuid,                               -- (선택) 로그인 유저
    fingerprint text,                           -- (선택) 비로그인 유저 식별자
    is_admin boolean DEFAULT false,             -- 관리자 여부
    user_agent text,                            -- 브라우저 정보
    created_at timestamptz DEFAULT now()       -- 발생 시간
);

-- 2. [NEW] 사이트 이용 통계 스냅샷 테이블 (대시보드 성능 최적화용)
CREATE TABLE IF NOT EXISTS public.site_usage_stats (
    id bigserial PRIMARY KEY,
    logged_in_count integer DEFAULT 0,
    anonymous_count integer DEFAULT 0,
    total_count integer DEFAULT 0,
    admin_count integer DEFAULT 0,
    snapshot_time timestamptz DEFAULT now()
);

-- 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.site_analytics_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_target_type ON public.site_analytics_logs (target_type);
CREATE INDEX IF NOT EXISTS idx_usage_snapshot_time ON public.site_usage_stats (snapshot_time DESC);

-- 3. RLS 정책 설정
ALTER TABLE public.site_analytics_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_usage_stats ENABLE ROW LEVEL SECURITY;

-- 익명 유저/일반 유저: 로그 삽입만 허용 (보안을 위해 조회 불가)
CREATE POLICY "Allow individual insert for everyone" ON public.site_analytics_logs
    FOR INSERT WITH CHECK (true);

-- 관리자: 모든 로그 및 통계 조회 허용 (is_admin() 헬퍼 함수 활용)
-- (기존에 정의된 public.is_admin() 함수가 있다고 가정하며, 없을 경우 이전 대화의 구현체 사용)
CREATE POLICY "Allow admin to read logs" ON public.site_analytics_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Allow admin to manage stats" ON public.site_usage_stats
    FOR ALL TO authenticated
    USING (public.is_admin());

-- 4. [Optional] 자동 스냅샷 생성을 위한 RPC (어드민 대시보드에서 필요 시 호출)
CREATE OR REPLACE FUNCTION public.create_usage_snapshot(
    p_logged_in integer,
    p_anonymous integer,
    p_admin integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF public.is_admin() THEN
        INSERT INTO public.site_usage_stats (logged_in_count, anonymous_count, total_count, admin_count)
        VALUES (p_logged_in, p_anonymous, p_logged_in + p_anonymous, p_admin);
    END IF;
END;
$$;
