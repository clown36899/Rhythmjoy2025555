-- history_nodes 테이블에 개별 비디오 연결을 위한 컬럼 추가

ALTER TABLE history_nodes
ADD COLUMN IF NOT EXISTS linked_video_id UUID REFERENCES learning_videos(id);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_history_nodes_linked_video_id ON history_nodes(linked_video_id);
