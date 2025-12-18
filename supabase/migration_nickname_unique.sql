-- Add unique constraint to nickname column in board_users
-- First, handle any existing duplicates if necessary (this script assumes no duplicates exist or fails)
-- To be safe, we use a DO block to check if it already exists

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'board_users_nickname_key'
    ) THEN
        ALTER TABLE public.board_users ADD CONSTRAINT board_users_nickname_key UNIQUE (nickname);
    END IF;
END $$;
