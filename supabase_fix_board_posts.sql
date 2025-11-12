-- board_posts 테이블에 누락된 컬럼 추가

-- 1. author_nickname 컬럼 추가 (작성자 닉네임)
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS author_nickname TEXT NOT NULL DEFAULT '';

-- 2. is_notice 컬럼 추가 (공지 여부)
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS is_notice BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. prefix_id 컬럼 추가 (머릿말 ID)
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS prefix_id INTEGER;

-- 4. prefix_id를 board_prefixes 테이블과 연결 (외래키)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'board_prefixes') THEN
    ALTER TABLE board_posts 
    DROP CONSTRAINT IF EXISTS board_posts_prefix_id_fkey;
    
    ALTER TABLE board_posts 
    ADD CONSTRAINT board_posts_prefix_id_fkey 
    FOREIGN KEY (prefix_id) REFERENCES board_prefixes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. password 컬럼을 nullable로 변경 (Kakao 로그인 사용자는 비밀번호 불필요)
ALTER TABLE board_posts 
ALTER COLUMN password DROP NOT NULL;
