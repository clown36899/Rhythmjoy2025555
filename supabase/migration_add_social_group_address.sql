-- Add address and link columns to social_groups table if they don't exist
ALTER TABLE public.social_groups 
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS link text;

-- Optional: Add comment
COMMENT ON COLUMN public.social_groups.address IS '장소/모임 위치 주소';
COMMENT ON COLUMN public.social_groups.link IS '관련 링크 (오픈채팅/홈페이지 등)';
