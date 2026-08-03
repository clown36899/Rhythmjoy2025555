CREATE TABLE IF NOT EXISTS user_board_post_reads (
  user_id VARCHAR(64) NOT NULL,
  post_id VARCHAR(128) NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  KEY user_board_post_reads_user_time_idx (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
