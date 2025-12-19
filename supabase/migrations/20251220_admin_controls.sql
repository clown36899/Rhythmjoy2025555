-- 1. Add is_hidden column for specific post hiding (Admin/Manager control)
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

-- 2. Create board_categories table for Admin control of board names & visibility
CREATE TABLE IF NOT EXISTS board_categories (
    code text PRIMARY KEY,        -- 'free', 'trade', 'notice', 'market'
    name text NOT NULL,           -- Display Name (e.g. '자유게시판', '벼룩시장')
    is_active boolean DEFAULT true, -- Visibility toggle
    display_order int DEFAULT 0   -- Tab order
);

-- 3. Create board_admins table to support the RLS policy (Fixing the error)
CREATE TABLE IF NOT EXISTS board_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- 4. Seed initial data for categories (safe to run multiple times)
INSERT INTO board_categories (code, name, is_active, display_order)
VALUES 
    ('notice', '공지사항', true, 10),
    ('free', '자유게시판', true, 20),
    ('market', '벼룩시장', true, 30),
    ('trade', '양도게시판', true, 40)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, 
    display_order = EXCLUDED.display_order;

-- 5. Enable RLS
ALTER TABLE board_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_admins ENABLE ROW LEVEL SECURITY;

-- 6. Policies

-- Allow public read access to categories (Code fix: simple true policy)
DROP POLICY IF EXISTS "Allow public read access" ON board_categories;
CREATE POLICY "Allow public read access" ON board_categories
    FOR SELECT USING (true);

-- Allow admin write access (Using the new table)
DROP POLICY IF EXISTS "Allow admin full access" ON board_categories;
CREATE POLICY "Allow admin full access" ON board_categories
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM board_admins)
    );

-- Allow admins to view/manage admin list
DROP POLICY IF EXISTS "Allow admin manage access" ON board_admins;
CREATE POLICY "Allow admin manage access" ON board_admins
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM board_admins)
    );
