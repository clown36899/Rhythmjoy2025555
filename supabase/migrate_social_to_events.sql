-- 1. events 테이블 확장 (컬럼 추가 및 제약 조건 수정)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS group_id int8;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS day_of_week int2;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS scope text DEFAULT 'domestic';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS views int4 DEFAULT 0;

-- 카테고리 제약 조건에 'social' 및 소셜 유형 추가
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_check;
ALTER TABLE public.events ADD CONSTRAINT events_category_check 
    CHECK (category IN ('class', 'event', 'regular', 'club', 'social', 'swing-bar', 'swing-club', 'other'));

-- 필수 컬럼 제약 조건 완화 (소셜 정기 일정 지원)
ALTER TABLE public.events ALTER COLUMN date DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN location DROP NOT NULL;

-- 2. 데이터 이관 (social_schedules -> events)
INSERT INTO public.events (
    title, 
    date, 
    day_of_week, 
    time, 
    location, 
    address, 
    venue_id, 
    venue_name,
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
    start_time::text, 
    place_name, 
    address, 
    venue_id,
    place_name, 
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
    NULL,
    COALESCE(category, 'social'),
    'domestic',
    group_id,
    COALESCE(views, 0)
FROM public.social_schedules
WHERE NOT EXISTS (
    SELECT 1 FROM public.events e 
    WHERE e.group_id = public.social_schedules.group_id 
    AND e.title = public.social_schedules.title 
    AND e.date = public.social_schedules.date
    AND COALESCE(e.time, '') = COALESCE(public.social_schedules.start_time::text, '')
);
