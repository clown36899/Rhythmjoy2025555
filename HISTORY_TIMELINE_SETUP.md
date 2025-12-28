# History Timeline - 빠른 설치 가이드

## ⚡ Supabase Dashboard에서 SQL 실행

1. **Supabase Dashboard 접속**: https://supabase.com/dashboard
2. 프로젝트 선택: `mkoryudscamnopvxdelk`
3. **SQL Editor** 메뉴 클릭
4. 아래 SQL 복사 & 붙여넣기
5. **Run** 버튼 클릭

```sql
-- History Timeline Tables
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

CREATE INDEX IF NOT EXISTS idx_history_nodes_year ON history_nodes(year);
CREATE INDEX IF NOT EXISTS idx_history_edges_source ON history_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_history_edges_target ON history_edges(target_id);

ALTER TABLE history_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view history nodes" ON history_nodes FOR SELECT USING (true);
CREATE POLICY "Anyone can view history edges" ON history_edges FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create nodes" ON history_nodes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can create edges" ON history_edges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Creators can update their nodes" ON history_nodes FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete their nodes" ON history_nodes FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can update their edges" ON history_edges FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete their edges" ON history_edges FOR DELETE TO authenticated USING (auth.uid() = created_by);
```

## ✅ 실행 후

1. `/history` 페이지 새로고침
2. "노드 추가" 버튼으로 첫 이벤트 생성
3. 유튜브 URL 입력 → 썸네일 자동 표시
4. 노드 드래그로 배치
5. 노드 핸들 드래그로 연결 생성

---

**CLI 방법은 복잡함**: Supabase CLI의 migration history 충돌 때문에 Dashboard 직접 실행이 가장 빠르고 확실합니다.
