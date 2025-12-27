-- 1. category 컬럼에 'club'이 포함되도록 제약조건 업데이트
-- 기존 제약조건 이름이 check_category 이거나 events_category_check 일 수 있으므로 둘 다 삭제 시도
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS check_category;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_check;

-- 새로운 제약조건 추가 ('class', 'event' 외에 'club' 추가)
ALTER TABLE public.events ADD CONSTRAINT events_category_check 
  CHECK (category IN ('class', 'event', 'club'));

-- 2. genre 컬럼에는 보통 제약조건이 없으나, 혹시 있다면 삭제 (자유로운 입력 허용)
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_genre_check;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS check_genre;
