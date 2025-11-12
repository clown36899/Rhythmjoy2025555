-- 게시판 테이블 생성 (Kakao 로그인 전용, 비밀번호 없음)

CREATE TABLE IF NOT EXISTS board_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_nickname TEXT NOT NULL,
  user_id TEXT,
  views INTEGER DEFAULT 0,
  is_notice BOOLEAN DEFAULT FALSE,
  prefix_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- prefix_id를 board_prefixes와 연결
ALTER TABLE board_posts 
ADD CONSTRAINT board_posts_prefix_id_fkey 
FOREIGN KEY (prefix_id) REFERENCES board_prefixes(id) ON DELETE SET NULL;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_board_posts_user_id ON board_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_board_posts_created_at ON board_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_is_notice ON board_posts(is_notice);
