-- Insert test prefix data for free board
-- This will add sample prefixes if they don't already exist

INSERT INTO board_prefixes (name, color, admin_only, display_order, board_category_code)
VALUES 
    ('잡담', '#3b82f6', false, 1, 'free'),
    ('질문', '#10b981', false, 2, 'free'),
    ('정보', '#f59e0b', false, 3, 'free'),
    ('후기', '#8b5cf6', false, 4, 'free')
ON CONFLICT DO NOTHING;
