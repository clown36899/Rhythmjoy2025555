-- A new-event subscription is forward-only. Persist the moment the route was
-- enabled so queue rows created before that moment cannot be delivered later.
SET @new_event_boundary_column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_notification_preferences'
     AND COLUMN_NAME = 'new_event_enabled_at'
);

SET @new_event_boundary_ddl = IF(
  @new_event_boundary_column_exists = 0,
  'ALTER TABLE user_notification_preferences ADD COLUMN new_event_enabled_at DATETIME NULL AFTER pref_new_event_alerts',
  'SELECT 1'
);

PREPARE new_event_boundary_statement FROM @new_event_boundary_ddl;
EXECUTE new_event_boundary_statement;
DEALLOCATE PREPARE new_event_boundary_statement;

UPDATE user_notification_preferences
   SET new_event_enabled_at = CASE
     WHEN enabled = 1 AND pref_new_event_alerts = 1
       THEN COALESCE(new_event_enabled_at, updated_at, created_at, CURRENT_TIMESTAMP)
     ELSE NULL
   END;
