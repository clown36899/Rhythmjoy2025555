-- Bell-open used to mark every row read before the user opened an individual card.
-- Restore recent new-event rows exactly once; future read state is explicit.
CREATE TABLE IF NOT EXISTS notification_data_migrations (
  migration_id VARCHAR(128) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;
INSERT IGNORE INTO notification_data_migrations (migration_id)
VALUES ('2026-08-11-explicit-new-event-read-recovery-v1');
SET @notification_read_recovery_applied = ROW_COUNT();

UPDATE user_notifications
   SET is_read = 0,
       read_at = NULL
 WHERE @notification_read_recovery_applied = 1
   AND kind = 'new_event'
   AND created_at >= '2026-08-03 00:00:00';
COMMIT;
