-- Migrate all unassigned prefixes to 'free' (자유게시판)
-- User request: "미지정 머릿말은 전부 자유게시판 머릿말이야"

UPDATE board_prefixes 
SET board_category_code = 'free' 
WHERE board_category_code IS NULL;

-- Optional: Ensure no nulls are allowed in future if we want to enforce it
-- ALTER TABLE board_prefixes ALTER COLUMN board_category_code SET NOT NULL;
