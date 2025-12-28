-- Check if board_prefixes table exists and view its data
SELECT * FROM board_prefixes LIMIT 10;

-- Check table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'board_prefixes';

-- Insert test data for 'free' category if empty
INSERT INTO board_prefixes (name, color, admin_only, display_order, board_category_code)
VALUES 
    ('잡담', '#3b82f6', false, 1, 'free'),
    ('질문', '#10b981', false, 2, 'free'),
    ('정보', '#f59e0b', false, 3, 'free'),
    ('후기', '#8b5cf6', false, 4, 'free')
ON CONFLICT DO NOTHING;

-- Verify insertion
SELECT * FROM board_prefixes WHERE board_category_code = 'free';
