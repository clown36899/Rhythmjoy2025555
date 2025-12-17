-- Add profile_image if it doesn't exist (Safe run)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'board_users' AND column_name = 'profile_image') THEN
        ALTER TABLE public.board_users ADD COLUMN profile_image text;
    END IF;
END $$;
