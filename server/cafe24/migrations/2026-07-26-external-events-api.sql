-- Partner-specific, registration-only API for external event sources.

CREATE TABLE IF NOT EXISTS external_api_partners (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  default_category VARCHAR(32) NULL,
  default_genre VARCHAR(64) NULL,
  allowed_category VARCHAR(32) NULL,
  allowed_classifications LONGTEXT NULL,
  environment VARCHAR(16) NOT NULL DEFAULT 'test',
  owner_user_id VARCHAR(64) NULL,
  per_minute_limit INT UNSIGNED NOT NULL DEFAULT 10,
  daily_limit INT UNSIGNED NOT NULL DEFAULT 200,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY external_api_partners_key_prefix_unique (key_prefix),
  UNIQUE KEY external_api_partners_key_hash_unique (key_hash),
  KEY external_api_partners_active_idx (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_partner_events (
  partner_id VARCHAR(64) NOT NULL,
  external_id VARCHAR(160) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  source_url TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (partner_id, external_id),
  UNIQUE KEY external_partner_events_event_unique (event_id),
  KEY external_partner_events_created_idx (created_at),
  CONSTRAINT external_partner_events_partner_fk
    FOREIGN KEY (partner_id) REFERENCES external_api_partners(id) ON DELETE RESTRICT,
  CONSTRAINT external_partner_events_event_fk
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_api_request_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_id VARCHAR(64) NOT NULL,
  external_id VARCHAR(160) NULL,
  event_id VARCHAR(64) NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  result VARCHAR(32) NOT NULL,
  error_code VARCHAR(64) NULL,
  request_ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY external_api_request_logs_partner_created_idx (partner_id, created_at),
  KEY external_api_request_logs_event_idx (event_id),
  CONSTRAINT external_api_request_logs_partner_fk
    FOREIGN KEY (partner_id) REFERENCES external_api_partners(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_api_admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL,
  partner_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  details_json LONGTEXT NULL,
  request_ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY external_api_admin_audit_partner_idx (partner_id, created_at),
  KEY external_api_admin_audit_admin_idx (admin_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
