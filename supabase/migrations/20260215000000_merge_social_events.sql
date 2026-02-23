-- 1. events 테이블 확장 (컬럼 추가)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS group_id int8;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS day_of_week int2;

-- 2. 데이터 이관 (social_schedules -> events)
INSERT INTO public.events (
    title, 
    date, 
    day_of_week, 
    time, 
    location, 
    address, 
    venue_id, 
    description, 
    image, 
    image_micro, 
    image_thumbnail, 
    image_medium, 
    image_full,
    link1, 
    link_name1, 
    contact,
    user_id, 
    password,
    created_at, 
    updated_at, 
    genre, 
    category, 
    scope, 
    group_id,
    views
)
SELECT 
    title, 
    date, 
    day_of_week, 
    start_time, 
    place_name, 
    address, 
    (CASE WHEN venue_id IS NOT NULL THEN venue_id::text ELSE NULL END),
    description, 
    image_url, 
    image_micro, 
    image_thumbnail, 
    image_medium, 
    image_full,
    link_url, 
    link_name, 
    inquiry_contact,
    user_id, 
    password,
    created_at, 
    updated_at,
    v2_genre, 
    v2_category, 
    scope, 
    group_id,
    COALESCE(views, 0)
FROM public.social_schedules;
