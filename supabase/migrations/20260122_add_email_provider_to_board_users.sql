-- Add email and provider columns to board_users if they don't exist
ALTER TABLE public.board_users 
ADD COLUMN IF NOT EXISTS email TEXT NULL,
ADD COLUMN IF NOT EXISTS provider TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.board_users.email IS '사용자 계정 이메일 (동기화용)';
COMMENT ON COLUMN public.board_users.provider IS '가입 경로 (kakao, google 등)';
