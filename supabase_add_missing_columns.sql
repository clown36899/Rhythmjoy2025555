-- board_posts 테이블에 누락된 컬럼만 안전하게 추가

-- 1. author_nickname 추가 (없으면)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'board_posts' AND column_name = 'author_nickname'
  ) THEN
    ALTER TABLE board_posts ADD COLUMN author_nickname TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- 2. is_notice 추가 (없으면)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'board_posts' AND column_name = 'is_notice'
  ) THEN
    ALTER TABLE board_posts ADD COLUMN is_notice BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- 3. prefix_id 추가 (없으면)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'board_posts' AND column_name = 'prefix_id'
  ) THEN
    ALTER TABLE board_posts ADD COLUMN prefix_id INTEGER;
  END IF;
END $$;

-- 4. 외래키 추가 (없으면, board_prefixes 테이블이 존재하는 경우에만)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'board_prefixes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'board_posts_prefix_id_fkey'
  ) THEN
    ALTER TABLE board_posts 
    ADD CONSTRAINT board_posts_prefix_id_fkey 
    FOREIGN KEY (prefix_id) REFERENCES board_prefixes(id) ON DELETE SET NULL;
  END IF;
END $$;
