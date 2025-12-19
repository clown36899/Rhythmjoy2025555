-- Force reset standard categories to be visible
INSERT INTO board_categories (code, name, is_active, display_order)
VALUES 
    ('notice', '공지사항', true, 10),
    ('free', '자유게시판', true, 20),
    ('market', '벼룩시장', true, 30),
    ('trade', '양도/양수', true, 40)
ON CONFLICT (code) DO UPDATE 
SET is_active = true, display_order = EXCLUDED.display_order;
