-- ========================================
-- 소셜 일정(social_schedules) 조회수 마이그레이션
-- ========================================

-- STEP 1: social_schedules 테이블의 views 컬럼 업데이트
UPDATE social_schedules
SET views = subquery.unique_views
FROM (
  SELECT 
    target_id::bigint as schedule_id,
    COUNT(DISTINCT 
      CASE 
        WHEN user_id IS NOT NULL THEN user_id::text
        ELSE fingerprint
      END
    ) as unique_views
  FROM site_analytics_logs
  WHERE (target_type = 'social' OR target_type = 'schedule')
    AND target_id ~ '^[0-9]+$'
  GROUP BY target_id
) AS subquery
WHERE social_schedules.id = subquery.schedule_id;

-- STEP 2: item_views 테이블에 기록 삽입
INSERT INTO item_views (user_id, fingerprint, item_type, item_id, created_at)
SELECT 
  user_id,
  CASE WHEN user_id IS NOT NULL THEN NULL ELSE fingerprint END as fingerprint,
  'schedule' as item_type,
  target_id::bigint as item_id,
  MIN(created_at) as created_at
FROM site_analytics_logs
WHERE (target_type = 'social' OR target_type = 'schedule')
  AND target_id ~ '^[0-9]+$'
  AND (user_id IS NOT NULL OR fingerprint IS NOT NULL)
GROUP BY 
  user_id,
  CASE WHEN user_id IS NOT NULL THEN NULL ELSE fingerprint END,
  target_id
ON CONFLICT DO NOTHING;
