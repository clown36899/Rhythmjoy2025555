-- Add board_category_code validation to board_prefixes
-- Allows separating prefixes by board (e.g. separate prefixes for 'free' and 'questions')

-- 1. Add column
ALTER TABLE board_prefixes 
ADD COLUMN IF NOT EXISTS board_category_code text REFERENCES board_categories(code) ON DELETE CASCADE;

-- 2. Optional: If you want to migrate existing prefixes to a default category (e.g. 'free')
-- UPDATE board_prefixes SET board_category_code = 'free' WHERE board_category_code IS NULL;

-- 3. Update Policy if needed (likely not if it's just public read / admin write)
-- Existing policies should cover it, but good to double check RLS.
-- "Allow public read access" exists
-- "Allow admin full access" exists

-- 4. Create an index for performance
CREATE INDEX IF NOT EXISTS idx_board_prefixes_category ON board_prefixes(board_category_code);

-- [Optional] Migrate existing prefixes
-- If you want to move all existing prefixes to the 'free' board (자유게시판), run this:
-- UPDATE board_prefixes SET board_category_code = 'free' WHERE board_category_code IS NULL;

-- If you have specific prefixes for other boards, update them by ID or Name:
-- UPDATE board_prefixes SET board_category_code = 'market' WHERE name = '판매';
