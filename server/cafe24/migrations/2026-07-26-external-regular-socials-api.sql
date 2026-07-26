CREATE TABLE IF NOT EXISTS external_regular_social_rules (
  partner_id VARCHAR(64) NOT NULL,
  external_id VARCHAR(160) NOT NULL,
  title VARCHAR(255) NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  time_text VARCHAR(255) NULL,
  location VARCHAR(255) NOT NULL,
  venue_name VARCHAR(255) NULL,
  source_url TEXT NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  valid_from DATE NULL,
  valid_until DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (partner_id, external_id),
  KEY external_regular_social_rules_active_idx (is_active, weekday),
  CONSTRAINT external_regular_social_rules_partner_fk
    FOREIGN KEY (partner_id) REFERENCES external_api_partners(id) ON DELETE CASCADE,
  CONSTRAINT external_regular_social_rules_weekday_check CHECK (weekday BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_regular_social_exceptions (
  partner_id VARCHAR(64) NOT NULL,
  rule_external_id VARCHAR(160) NOT NULL,
  external_id VARCHAR(160) NOT NULL,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(16) NOT NULL,
  title VARCHAR(255) NULL,
  time_text VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  venue_name VARCHAR(255) NULL,
  dj_name VARCHAR(255) NULL,
  source_url TEXT NULL,
  description LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (partner_id, rule_external_id, external_id),
  KEY external_regular_social_exceptions_date_idx (exception_date, exception_type),
  CONSTRAINT external_regular_social_exceptions_rule_fk
    FOREIGN KEY (partner_id, rule_external_id)
    REFERENCES external_regular_social_rules(partner_id, external_id) ON DELETE CASCADE,
  CONSTRAINT external_regular_social_exceptions_type_check
    CHECK (exception_type IN ('closure', 'override'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
