-- ========================================
-- [최종] 모든 조회수 수치 재정렬 (6시간 단위)
-- ========================================

-- 1. 이벤트/강습 조회수 재산출 (events 테이블)
UPDATE events
SET views = subquery.adjusted_views
FROM (
  SELECT 
    target_id::bigint as event_id,
    COUNT(*) as adjusted_views
  FROM (
    -- 6시간 단위로 그룹화된 유니크 클릭 재계산
    SELECT 
      target_id,
      user_id,
      fingerprint,
      floor(extract(epoch from created_at) / (6 * 3600)) as time_bucket
    FROM site_analytics_logs
    WHERE (target_type = 'event' OR target_type = 'class')
      AND target_id ~ '^[0-9]+$'
      AND is_admin = false  -- 관리자 제외
    GROUP BY target_id, user_id, fingerprint, time_bucket
  ) t
  GROUP BY target_id
) AS subquery
WHERE events.id = subquery.event_id;

-- 2. 소셜 일정 조회수 재산출 (social_schedules 테이블)
UPDATE social_schedules
SET views = subquery.adjusted_views
FROM (
  SELECT 
    target_id::bigint as schedule_id,
    COUNT(*) as adjusted_views
  FROM (
    -- 6시간 단위로 그룹화된 유니크 클릭 재계산
    SELECT 
      target_id,
      user_id,
      fingerprint,
      floor(extract(epoch from created_at) / (6 * 3600)) as time_bucket
    FROM site_analytics_logs
    WHERE (target_type = 'social' OR target_type = 'schedule')
      AND target_id ~ '^[0-9]+$'
      AND is_admin = false  -- 관리자 제외
    GROUP BY target_id, user_id, fingerprint, time_bucket
  ) t
  GROUP BY target_id
) AS subquery
WHERE social_schedules.id = subquery.schedule_id;

-- 3. item_views 테이블도 6시간 단위 기록으로 재구성 (선택 사항이지만 일관성을 위해 수행)
-- 기존 item_views를 비우고 다시 채울 수도 있으나, 데이터 보존을 위해 유지하면서 
-- 앞으로는 RPC가 6시간 단위로 체크하여 중복 삽입을 막을 것입니다.
