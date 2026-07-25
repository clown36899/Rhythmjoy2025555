SET @add_allowed_classifications = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE external_api_partners ADD COLUMN allowed_classifications LONGTEXT NULL AFTER default_genre',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'external_api_partners'
    AND COLUMN_NAME = 'allowed_classifications'
);
PREPARE add_allowed_classifications_stmt FROM @add_allowed_classifications;
EXECUTE add_allowed_classifications_stmt;
DEALLOCATE PREPARE add_allowed_classifications_stmt;

SET @add_environment = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE external_api_partners ADD COLUMN environment VARCHAR(16) NOT NULL DEFAULT ''live'' AFTER allowed_classifications',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'external_api_partners'
    AND COLUMN_NAME = 'environment'
);
PREPARE add_environment_stmt FROM @add_environment;
EXECUTE add_environment_stmt;
DEALLOCATE PREPARE add_environment_stmt;

ALTER TABLE external_api_partners
  MODIFY COLUMN environment VARCHAR(16) NOT NULL DEFAULT 'test';

CREATE TABLE IF NOT EXISTS external_api_partner_requests (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  requester_user_id VARCHAR(64) NOT NULL,
  partner_name VARCHAR(120) NOT NULL,
  contact VARCHAR(255) NOT NULL,
  note TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  approved_partner_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  KEY external_api_partner_requests_status_idx (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
