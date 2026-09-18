-- Body-read timestamps cannot identify which comments actually rendered.
-- Add exact comment IDs to the existing user/post read owner; old clients ignore this column.
SET @board_comment_reads_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_board_post_reads'
    AND COLUMN_NAME = 'read_comment_ids'
);
SET @board_comment_reads_ddl = IF(@board_comment_reads_exists = 0,
  'ALTER TABLE user_board_post_reads ADD COLUMN read_comment_ids LONGTEXT NULL', 'SELECT 1');
PREPARE board_comment_reads_statement FROM @board_comment_reads_ddl;
EXECUTE board_comment_reads_statement;
DEALLOCATE PREPARE board_comment_reads_statement;
