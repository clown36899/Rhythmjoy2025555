CREATE DATABASE IF NOT EXISTS swingenjoy_app
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE swingenjoy_app;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  email VARCHAR(255) NULL,
  nickname VARCHAR(120) NULL,
  profile_image TEXT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY users_provider_user_unique (provider, provider_user_id),
  KEY users_email_idx (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  KEY sessions_user_idx (user_id),
  KEY sessions_expires_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  date_value DATE NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  event_dates_json LONGTEXT NULL,
  time_text VARCHAR(120) NULL,
  location VARCHAR(255) NULL,
  location_link TEXT NULL,
  category VARCHAR(64) NULL,
  genre VARCHAR(120) NULL,
  dance_scope VARCHAR(64) NULL,
  activity_type VARCHAR(64) NULL,
  image_url TEXT NULL,
  image_thumbnail TEXT NULL,
  image_medium TEXT NULL,
  description MEDIUMTEXT NULL,
  link1 TEXT NULL,
  link_name1 VARCHAR(120) NULL,
  group_id INT NULL,
  venue_name VARCHAR(255) NULL,
  address VARCHAR(255) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  raw_json LONGTEXT NOT NULL,
  import_batch VARCHAR(80) NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY events_start_idx (start_date),
  KEY events_date_idx (date_value),
  KEY events_end_idx (end_date),
  KEY events_category_idx (category),
  KEY events_scope_idx (dance_scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(120) NULL,
  user_id VARCHAR(64) NULL,
  event_type VARCHAR(80) NULL,
  path VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  referrer TEXT NULL,
  user_agent TEXT NULL,
  raw_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY analytics_created_idx (created_at),
  KEY analytics_session_idx (session_id),
  KEY analytics_user_idx (user_id),
  KEY analytics_path_idx (path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generic_records (
  table_name VARCHAR(80) NOT NULL,
  record_id VARCHAR(160) NOT NULL,
  data_json LONGTEXT NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_name, record_id),
  KEY generic_table_idx (table_name),
  KEY generic_created_idx (created_at),
  KEY generic_updated_idx (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
