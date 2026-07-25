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
