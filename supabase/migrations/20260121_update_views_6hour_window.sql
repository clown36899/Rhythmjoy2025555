-- ========================================
-- 조회수 집계 기준 완화 (6시간 단위) 및 정합성 개선
-- ========================================

-- 0. 조회수 컬럼이 없는 경우 생성
ALTER TABLE social_schedules ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

-- 1. 기존의 "평생 1회" 유니크 제약 조건 제거
ALTER TABLE item_views DROP CONSTRAINT IF EXISTS unique_user_item_view;
ALTER TABLE item_views DROP CONSTRAINT IF EXISTS unique_fingerprint_item_view;

-- 2. 6시간 기반 중복 체크를 수행하도록 RPC 함수 고도화
CREATE OR REPLACE FUNCTION increment_item_views(
  p_item_id BIGINT,
  p_item_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 6시간 이내에 동일 유저/핑거프린트의 조회 기록이 있는지 확인
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM item_views
    WHERE item_id = p_item_id
      AND item_type = p_item_type
      AND user_id = p_user_id
      AND created_at > now() - interval '6 hours';
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM item_views
    WHERE item_id = p_item_id
      AND item_type = p_item_type
      AND fingerprint = p_fingerprint
      AND created_at > now() - interval '6 hours';
  END IF;

  -- 6시간 내 기록이 없으면 신규 조회로 인정
  IF v_count = 0 THEN
    -- 로그 삽입
    INSERT INTO item_views (item_id, item_type, user_id, fingerprint)
    VALUES (p_item_id, p_item_type, p_user_id, p_fingerprint);

    -- 해당 테이블의 views 카운터 증가
    CASE p_item_type
      WHEN 'board_post' THEN
        UPDATE board_posts 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      WHEN 'event' THEN
        UPDATE events 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      WHEN 'schedule' THEN
        UPDATE social_schedules 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      ELSE
        -- 지원하지 않는 타입은 로그만 남김
    END CASE;

    RETURN TRUE;
  END IF;

  -- 6시간 이내 재방문은 카운트하지 않음
  RETURN FALSE;
END;
$$;

-- 3. 소셜 일정(social_schedules) 데이터 정합성 마이그레이션
-- 기존 클릭 로그를 6시간 단위로 필터링하여 views 컬럼 초기화
UPDATE social_schedules
SET views = subquery.adjusted_views
FROM (
  SELECT 
    target_id::bigint as schedule_id,
    COUNT(*) as adjusted_views
  FROM (
    -- 6시간 단위로 그룹화된 유니크 클릭 계산
    SELECT 
      target_id,
      user_id,
      fingerprint,
      floor(extract(epoch from created_at) / (6 * 3600)) as time_bucket
    FROM site_analytics_logs
    WHERE (target_type = 'social' OR target_type = 'schedule')
      AND target_id ~ '^[0-9]+$'
    GROUP BY target_id, user_id, fingerprint, time_bucket
  ) t
  GROUP BY target_id
) AS subquery
WHERE social_schedules.id = subquery.schedule_id;
