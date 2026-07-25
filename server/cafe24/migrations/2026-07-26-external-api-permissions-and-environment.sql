ALTER TABLE external_api_partners
  ADD COLUMN IF NOT EXISTS allowed_classifications JSON NULL AFTER default_genre,
  ADD COLUMN IF NOT EXISTS environment VARCHAR(16) NOT NULL DEFAULT 'live' AFTER allowed_classifications;

ALTER TABLE external_api_partners
  ALTER COLUMN environment SET DEFAULT 'test';

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
