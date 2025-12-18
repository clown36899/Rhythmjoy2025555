-- Make gender column nullable in board_users table
ALTER TABLE board_users 
ALTER COLUMN gender DROP NOT NULL;
