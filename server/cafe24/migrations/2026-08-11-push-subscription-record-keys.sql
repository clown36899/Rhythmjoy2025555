-- FCM endpoints exceed generic_records.record_id VARCHAR(160). Store a stable hash
-- while retaining the full endpoint inside data_json.
INSERT INTO generic_records (
  table_name,
  record_id,
  data_json,
  created_at,
  updated_at,
  imported_at
)
SELECT
  table_name,
  CONCAT('push:', SHA2(JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.endpoint')), 256)),
  data_json,
  created_at,
  updated_at,
  imported_at
FROM generic_records
WHERE table_name = 'user_push_subscriptions'
  AND JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.endpoint')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(data_json, '$.endpoint')) <> ''
ON DUPLICATE KEY UPDATE
  data_json = VALUES(data_json),
  created_at = VALUES(created_at),
  updated_at = VALUES(updated_at),
  imported_at = CURRENT_TIMESTAMP;

DELETE FROM generic_records
WHERE table_name = 'user_push_subscriptions'
  AND record_id NOT LIKE 'push:%';
