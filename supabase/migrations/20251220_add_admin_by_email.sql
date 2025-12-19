-- 이메일만 본인 것으로 변경하고 전체 실행하세요
INSERT INTO board_admins (user_id)
SELECT id FROM auth.users WHERE email = 'my_email@example.com'
ON CONFLICT (user_id) DO NOTHING;

SELECT * FROM board_admins;
