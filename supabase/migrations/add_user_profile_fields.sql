-- Add user profile fields to board_users table
-- Migration: add_user_profile_fields
-- Created: 2025-12-29

-- Add real_name column (실명)
ALTER TABLE public.board_users 
ADD COLUMN IF NOT EXISTS real_name TEXT NULL;

-- Add phone_number column (전화번호)
ALTER TABLE public.board_users 
ADD COLUMN IF NOT EXISTS phone_number TEXT NULL;

-- Add age_range column (연령대: 10대, 20대, 30대, 40대, 50대, 60대 이상)
ALTER TABLE public.board_users 
ADD COLUMN IF NOT EXISTS age_range TEXT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.board_users.real_name IS '사용자 실명 (선택)';
COMMENT ON COLUMN public.board_users.phone_number IS '전화번호 (선택, 형식: +82-10-1234-5678)';
COMMENT ON COLUMN public.board_users.age_range IS '연령대 (선택, 예: 10대, 20대, 30대, 40대, 50대, 60대 이상)';

-- Create index for phone_number (optional, for faster lookups if needed)
CREATE INDEX IF NOT EXISTS idx_board_users_phone_number 
ON public.board_users USING btree (phone_number) 
TABLESPACE pg_default;
