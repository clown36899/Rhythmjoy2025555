-- Remove real_name and phone columns to avoid storing sensitive data
ALTER TABLE public.board_users DROP COLUMN IF EXISTS real_name;
ALTER TABLE public.board_users DROP COLUMN IF EXISTS phone;
