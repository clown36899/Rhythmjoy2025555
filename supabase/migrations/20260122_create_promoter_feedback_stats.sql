-- View: user_impact_stats_view
-- Purpose: Aggregate activity stats (Posts + Events) for each user
-- This is a lightweight view that sums up existing columns.

-- Clean up the old view to allow column type changes (UUID -> TEXT or vice versa)
DROP VIEW IF EXISTS user_impact_stats_view;

CREATE OR REPLACE VIEW user_impact_stats_view 
WITH (security_invoker = true)
AS
WITH post_stats AS (
    SELECT user_id, count(*) as count, sum(views) as views, sum(likes) as likes
    FROM board_posts 
    WHERE is_hidden = false 
    GROUP BY user_id
),
event_stats AS (
    SELECT user_id, count(*) as count, sum(views) as views
    FROM events 
    GROUP BY user_id
)
SELECT
    u.user_id::uuid as user_id,
    COALESCE(p.count, 0) as total_posts,
    COALESCE(p.views, 0) as total_post_views,
    COALESCE(p.likes, 0) as total_post_likes,
    COALESCE(e.count, 0) as total_events,
    COALESCE(e.views, 0) as total_event_views,
    (COALESCE(p.views, 0) + COALESCE(e.views, 0)) as total_combined_views
FROM
    board_users u
    LEFT JOIN post_stats p ON u.user_id = p.user_id
    LEFT JOIN event_stats e ON u.user_id = e.user_id;

-- Function: get_user_today_views
-- Purpose: Count views for a user's *posts* and *events* that happened TODAY
CREATE OR REPLACE FUNCTION get_user_today_views(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    today_views INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO today_views
    FROM site_analytics_logs
    WHERE 
        -- 접속 시간이 오늘(UTC 기준) 이후인 경우
        created_at >= (now() AT TIME ZONE 'UTC')::date
        
        -- 그리고 그 대상 ID가 해당 유저가 쓴 글(board_posts) 또는 행사(events)인 경우
        AND (
            (target_type = 'board_post' AND target_id IN (SELECT id::text FROM board_posts WHERE user_id = target_user_id))
            OR
            (target_type = 'event' AND target_id IN (SELECT id::text FROM events WHERE user_id = target_user_id))
        );
    
    RETURN COALESCE(today_views, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
