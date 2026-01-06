-- Add recruitment columns to social_groups table
ALTER TABLE public.social_groups 
ADD COLUMN IF NOT EXISTS recruit_content text,
ADD COLUMN IF NOT EXISTS recruit_contact text,
ADD COLUMN IF NOT EXISTS recruit_link text,
ADD COLUMN IF NOT EXISTS recruit_image text;

-- Add comments for clarity
COMMENT ON COLUMN public.social_groups.recruit_content IS '신규 모집 내용';
COMMENT ON COLUMN public.social_groups.recruit_contact IS '신규 모집 연락처';
COMMENT ON COLUMN public.social_groups.recruit_link IS '신규 모집 관련 링크';
COMMENT ON COLUMN public.social_groups.recruit_image IS '신규 모집 홍보 이미지 URL';
