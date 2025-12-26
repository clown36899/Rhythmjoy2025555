-- Add image size fields to social_groups table
ALTER TABLE public.social_groups
ADD COLUMN IF NOT EXISTS image_micro text,
ADD COLUMN IF NOT EXISTS image_thumbnail text,
ADD COLUMN IF NOT EXISTS image_medium text,
ADD COLUMN IF NOT EXISTS image_full text;

-- Add comment for documentation
COMMENT ON COLUMN public.social_groups.image_micro IS 'Optimized image URL - 100px';
COMMENT ON COLUMN public.social_groups.image_thumbnail IS 'Optimized image URL - 300px';
COMMENT ON COLUMN public.social_groups.image_medium IS 'Optimized image URL - 650px';
COMMENT ON COLUMN public.social_groups.image_full IS 'Optimized image URL - 1300px';
