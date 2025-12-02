-- 배포 알림 테이블
CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  build_id TEXT,
  site_name TEXT DEFAULT 'billboard'
);

-- RLS 활성화 (공개 읽기)
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
  ON deployments FOR SELECT
  TO PUBLIC
  USING (true);

-- 최신 배포만 유지 (자동 정리)
CREATE OR REPLACE FUNCTION cleanup_old_deployments()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM deployments
  WHERE id NOT IN (
    SELECT id FROM deployments
    ORDER BY deployed_at DESC
    LIMIT 5
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_deployments
  AFTER INSERT ON deployments
  EXECUTE FUNCTION cleanup_old_deployments();
