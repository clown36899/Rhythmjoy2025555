-- 기존 site_analytics_logs 데이터를 새 조회수 시스템으로 마이그레이션
-- 544건의 이벤트 클릭 데이터를 events.views와 item_views에 반영

-- ========================================
-- STEP 1: events 테이블의 views 컬럼 업데이트
-- ========================================
-- 각 이벤트별로 유니크 조회수를 계산하여 views 컬럼에 반영
-- 이벤트(target_type='event')와 강습(target_type='class') 모두 포함

UPDATE events
SET views = subquery.unique_views
FROM (
  SELECT 
    target_id::bigint as event_id,
    COUNT(DISTINCT 
      CASE 
        WHEN user_id IS NOT NULL THEN user_id::text
        ELSE fingerprint
      END
    ) as unique_views
  FROM site_analytics_logs
  WHERE (target_type = 'event' OR target_type = 'class')  -- 이벤트와 강습 모두 포함
    AND target_id ~ '^[0-9]+$'  -- 숫자만 (social- 제외)
  GROUP BY target_id
) AS subquery
WHERE events.id = subquery.event_id;

-- ========================================
-- STEP 2: item_views 테이블에 기록 삽입
-- ========================================
-- 중복 제거된 조회 기록을 item_views에 삽입
-- user_id가 있으면 user_id만, 없으면 fingerprint만 사용

-- 2-1. 이벤트 클릭 데이터 (target_type = 'event')
INSERT INTO item_views (user_id, fingerprint, item_type, item_id, created_at)
SELECT 
  user_id,
  CASE WHEN user_id IS NOT NULL THEN NULL ELSE fingerprint END as fingerprint,
  'event' as item_type,
  target_id::bigint as item_id,
  MIN(created_at) as created_at
FROM site_analytics_logs
WHERE target_type = 'event'
  AND target_id ~ '^[0-9]+$'
  AND (user_id IS NOT NULL OR fingerprint IS NOT NULL)
GROUP BY 
  user_id,
  CASE WHEN user_id IS NOT NULL THEN NULL ELSE fingerprint END,
  target_id
ON CONFLICT DO NOTHING;

-- 2-2. 강습 클릭 데이터 (target_type = 'class')
INSERT INTO item_views (user_id, fingerprint, item_type, item_id, created_at)
SELECT 
  user_id,
  CASE WHEN user_id IS NOT NULL THEN NULL ELSE fingerprint END as fingerprint,
  'event' as item_type,  -- 강습도 events 테이블에 있으므로 'event'로 저장
  target_id::bigint as item_id,
  MIN(created_at) as created_at
FROM site_analytics_logs
WHERE target_type = 'class'
  AND target_id ~ '^[0-9]+$'
  AND (user_id IS NOT NULL OR fingerprint IS NOT NULL)
GROUP BY 
  user_id,
  CASE WHEN user_id IS NOT NULL THEN NULL ELSE fingerprint END,
  target_id
ON CONFLICT DO NOTHING;

-- ========================================
-- STEP 3: 검증 쿼리
-- ========================================
-- 마이그레이션 결과 확인

-- 3-1. events 테이블의 views 컬럼 확인
SELECT 
  id,
  title,
  views,
  category
FROM events
WHERE views > 0
ORDER BY views DESC
LIMIT 10;

-- 3-2. item_views 테이블 확인
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT item_id) as unique_events
FROM item_views
WHERE item_type = 'event';

-- 3-3. 비교: site_analytics_logs vs item_views
SELECT 
  'site_analytics_logs' as source,
  COUNT(DISTINCT target_id) as unique_events,
  COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id::text ELSE fingerprint END) as unique_users
FROM site_analytics_logs
WHERE target_type = 'event' AND target_id ~ '^[0-9]+$'
UNION ALL
SELECT 
  'item_views' as source,
  COUNT(DISTINCT item_id) as unique_events,
  COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id::text ELSE fingerprint END) as unique_users
FROM item_views
WHERE item_type = 'event';
