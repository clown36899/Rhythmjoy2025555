-- Ingestor V3 candidate-only schema.
--
-- This migration intentionally does not alter or write to the live `events`
-- table. Automation may read `events` for duplicate detection, but V3 storage
-- is isolated to the ingestor tables below.

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  profile VARCHAR(80) NOT NULL,
  engine VARCHAR(80) NULL,
  status ENUM('running', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  source_count INT NOT NULL DEFAULT 0,
  source_success_count INT NOT NULL DEFAULT 0,
  source_failure_count INT NOT NULL DEFAULT 0,
  candidate_new_count INT NOT NULL DEFAULT 0,
  candidate_duplicate_count INT NOT NULL DEFAULT 0,
  candidate_review_count INT NOT NULL DEFAULT 0,
  candidate_excluded_count INT NOT NULL DEFAULT 0,
  summary_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY ingestion_runs_profile_idx (profile),
  KEY ingestion_runs_status_idx (status),
  KEY ingestion_runs_started_idx (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_sources (
  id VARCHAR(120) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(80) NOT NULL,
  url TEXT NOT NULL,
  scope VARCHAR(64) NULL,
  genre_family VARCHAR(64) NULL,
  dance_genre VARCHAR(64) NULL,
  priority INT NOT NULL DEFAULT 3,
  save_policy VARCHAR(120) NULL,
  discovery_only TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  registry_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY ingestion_sources_scope_idx (scope),
  KEY ingestion_sources_type_idx (source_type),
  KEY ingestion_sources_priority_idx (priority),
  KEY ingestion_sources_active_idx (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_source_health (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  run_id VARCHAR(64) NULL,
  source_id VARCHAR(120) NOT NULL,
  checked_at DATETIME NOT NULL,
  status ENUM('ok', 'no_content', 'access_failed', 'circuit_open', 'skipped') NOT NULL,
  failure_category VARCHAR(80) NULL,
  failure_reason TEXT NULL,
  last_success_at DATETIME NULL,
  details_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY ingestion_source_health_run_idx (run_id),
  KEY ingestion_source_health_source_idx (source_id),
  KEY ingestion_source_health_status_idx (status),
  KEY ingestion_source_health_checked_idx (checked_at),
  CONSTRAINT ingestion_source_health_run_fk
    FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_candidates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  run_id VARCHAR(64) NULL,
  source_id VARCHAR(120) NULL,
  legacy_scraped_event_id VARCHAR(160) NULL,
  source_url TEXT NOT NULL,
  normalized_source_url TEXT NOT NULL,
  source_url_hash CHAR(64) NOT NULL,
  event_date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  venue_name VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  address VARCHAR(255) NULL,
  poster_url TEXT NULL,
  poster_storage_path TEXT NULL,
  extracted_text MEDIUMTEXT NULL,
  activity_type VARCHAR(64) NULL,
  dance_scope VARCHAR(64) NULL,
  genre_family VARCHAR(64) NULL,
  dance_genre VARCHAR(64) NULL,
  tags_json LONGTEXT NULL,
  confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  classification_reason TEXT NULL,
  needs_review_reason TEXT NULL,
  validation_errors_json LONGTEXT NULL,
  validation_warnings_json LONGTEXT NULL,
  evidence_json LONGTEXT NULL,
  duplicate_json LONGTEXT NULL,
  status ENUM('new', 'needs_review', 'duplicate', 'excluded', 'registered', 'archived') NOT NULL DEFAULT 'new',
  terminal_at DATETIME NULL,
  terminal_reason TEXT NULL,
  reviewed_by VARCHAR(64) NULL,
  reviewed_at DATETIME NULL,
  raw_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  KEY ingestion_candidates_run_idx (run_id),
  KEY ingestion_candidates_source_idx (source_id),
  KEY ingestion_candidates_status_idx (status),
  KEY ingestion_candidates_date_idx (event_date),
  KEY ingestion_candidates_scope_idx (dance_scope),
  KEY ingestion_candidates_activity_idx (activity_type),
  KEY ingestion_candidates_url_date_idx (source_url_hash, event_date),
  KEY ingestion_candidates_legacy_idx (legacy_scraped_event_id),
  CONSTRAINT ingestion_candidates_run_fk
    FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_candidate_event_links (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  link_type ENUM('duplicate_of', 'registered_as', 'manual_match') NOT NULL,
  confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  reason TEXT NULL,
  created_by VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details_json LONGTEXT NULL,
  UNIQUE KEY ingestion_candidate_event_link_unique (candidate_id, event_id, link_type),
  KEY ingestion_candidate_event_links_candidate_idx (candidate_id),
  KEY ingestion_candidate_event_links_event_idx (event_id),
  KEY ingestion_candidate_event_links_type_idx (link_type),
  CONSTRAINT ingestion_candidate_event_links_candidate_fk
    FOREIGN KEY (candidate_id) REFERENCES ingestion_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_candidate_state_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  actor_type ENUM('automation', 'admin', 'system') NOT NULL,
  actor_id VARCHAR(64) NULL,
  reason TEXT NULL,
  details_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ingestion_candidate_state_log_candidate_idx (candidate_id),
  KEY ingestion_candidate_state_log_created_idx (created_at),
  CONSTRAINT ingestion_candidate_state_log_candidate_fk
    FOREIGN KEY (candidate_id) REFERENCES ingestion_candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
