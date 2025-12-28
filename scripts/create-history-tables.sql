-- ⚡ 빠른 실행용: History Timeline 테이블 생성
-- Supabase Dashboard → SQL Editor에서 실행하세요

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS history_nodes (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE,
  year INTEGER,
  description TEXT,
  youtube_url TEXT,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS history_edges (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES history_nodes(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES history_nodes(id) ON DELETE CASCADE,
  relation_type TEXT DEFAULT 'related',
  label TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id)
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_history_nodes_year ON history_nodes(year);
CREATE INDEX IF NOT EXISTS idx_history_edges_source ON history_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_history_edges_target ON history_edges(target_id);

-- 3. RLS 활성화
ALTER TABLE history_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_edges ENABLE ROW LEVEL SECURITY;

-- 4. 정책 생성
CREATE POLICY "Anyone can view history nodes" ON history_nodes FOR SELECT USING (true);
CREATE POLICY "Anyone can view history edges" ON history_edges FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create nodes" ON history_nodes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can create edges" ON history_edges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Creators can update their nodes" ON history_nodes FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete their nodes" ON history_nodes FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can update their edges" ON history_edges FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete their edges" ON history_edges FOR DELETE TO authenticated USING (auth.uid() = created_by);
