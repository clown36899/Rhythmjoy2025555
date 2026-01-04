-- history_nodes 테이블에 카테고리(폴더) 연결을 위한 컬럼 추가
ALTER TABLE history_nodes 
ADD COLUMN linked_category_id UUID REFERENCES learning_categories(id) ON DELETE SET NULL;
