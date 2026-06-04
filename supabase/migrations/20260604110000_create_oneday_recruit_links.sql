CREATE TABLE IF NOT EXISTS public.swing_oneday_recruit_links (
  id text PRIMARY KEY,
  community text NOT NULL CHECK (length(trim(community)) > 0),
  venue text,
  region text NOT NULL CHECK (length(trim(region)) > 0),
  area text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  url text NOT NULL CHECK (url ~* '^https?://'),
  logo_source_url text CHECK (logo_source_url IS NULL OR logo_source_url = '' OR logo_source_url ~* '^https?://'),
  logo_micro text,
  logo_thumbnail text,
  logo_medium text,
  logo_full text,
  logo_storage_path text,
  logo_updated_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS swing_oneday_recruit_links_active_sort_idx
ON public.swing_oneday_recruit_links (is_active, sort_order, community);

CREATE OR REPLACE FUNCTION public.update_oneday_recruit_links_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_oneday_recruit_links_updated_at ON public.swing_oneday_recruit_links;
CREATE TRIGGER update_oneday_recruit_links_updated_at
BEFORE UPDATE ON public.swing_oneday_recruit_links
FOR EACH ROW
EXECUTE FUNCTION public.update_oneday_recruit_links_updated_at();

ALTER TABLE public.swing_oneday_recruit_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read oneday recruit links" ON public.swing_oneday_recruit_links;
CREATE POLICY "Everyone can read oneday recruit links"
ON public.swing_oneday_recruit_links
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public can insert oneday recruit links during test" ON public.swing_oneday_recruit_links;
CREATE POLICY "Public can insert oneday recruit links during test"
ON public.swing_oneday_recruit_links
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update oneday recruit links during test" ON public.swing_oneday_recruit_links;
CREATE POLICY "Public can update oneday recruit links during test"
ON public.swing_oneday_recruit_links
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.swing_oneday_recruit_links TO anon, authenticated;
GRANT ALL ON public.swing_oneday_recruit_links TO service_role;

INSERT INTO public.swing_oneday_recruit_links (
  id, community, venue, region, area, lat, lng, url, logo_source_url, sort_order
) VALUES
  ('swingscandal-littly', '스윙스캔들', '사보이', '서울', '서울 관악', 37.4784, 126.9516, 'https://litt.ly/hi_swingscandal', 'https://cdn.litt.ly/images/vzsOyoPuCyctOAAZXVnAvIDbKcuLoAkG?s=1200x630&m=inside', 10),
  ('swingkids-littly', '스윙키즈', '피에스타', '서울', '서울', 37.5665, 126.9780, 'https://litt.ly/swingkids', 'https://ugc.production.linktr.ee/007c01f9-60b7-458d-b11a-22d206c98688_51852459-328729544427043-4724087193759383552-n.jpeg', 20),
  ('swingfriends-littly', '스윙프렌즈', '타임', '서울', '서울', 37.5665, 126.9780, 'https://litt.ly/swingfriends', 'https://cdn.litt.ly/images/McR6j42D3iRRpZInU0Sq7DV9cYyfG1NA?s=1200x630&m=inside', 30),
  ('neoswing-linktree', '네오스윙', '해피홀', '서울', '서울', 37.5665, 126.9780, 'https://linktr.ee/neoswing', 'https://ugc.production.linktr.ee/vXVHYcQTfyWHAgnQKkx2_SsRy5dLw5pGFurtA', 40),
  ('swingtown-bongcheonsalon', '스윙타운', '봉천살롱', '서울', '서울 관악', 37.4784, 126.9516, 'https://linktr.ee/BongcheonSalon', 'https://ugc.production.linktr.ee/bfb38c82-5ae4-430e-9c3f-538b53ec0533_438242728-122142537692188072-11339055112714209-n.jpeg', 50),
  ('swingfamily-linktree', '스윙패밀리', '봉천살롱', '서울', '서울 관악', 37.4784, 126.9516, 'https://linktr.ee/swingfamily', 'https://ugc.production.linktr.ee/xCOZqSdKR06lA8PPI1kq_CeFz0QK7sI36RYWQ', 60),
  ('allaboutswing-1day', '올어바웃스윙', '경성홀', '서울', '서울', 37.5665, 126.9780, 'https://allaboutswing.co.kr/1day', 'https://cdn.imweb.me/upload/S201808105b6cf5f19bb78/43e7437c7b7a0.png', 70),
  ('swinghouse-littly', '스윙하우스', '비밥바', '인천', '인천', 37.4563, 126.7052, 'https://litt.ly/swinghouse', 'https://cdn.litt.ly/images/oufLbp7g7CaUYhfMxRbB7v8lPEhhVAeG?s=1200x630&m=inside', 80),
  ('sweetyswing-daum', '스위티스윙', '타임', '서울', '서울', 37.5665, 126.9780, 'https://m.cafe.daum.net/sweetyswing/5ngW', 'https://yt3.googleusercontent.com/ytc/AIdro_lzjkOO8MRv9qRDQKu6-Os6BUKetXoJ4gbAuf6IN-ZPnw=s900-c-k-c0x00ffffff-no-rj', 90),
  ('balboaland-linktree', '발보아랜드', '피에스타', '서울', '서울', 37.5665, 126.9780, 'https://linktr.ee/balboaland', 'https://ugc.production.linktr.ee/fb98d3aa-e03f-4f0b-af81-800351801513_500.jpeg', 100),
  ('swingfever-linktree', '스윙피버', '스윙잇', '대전', '대전', 36.3504, 127.3845, 'https://linktr.ee/swingfever.daejeon', 'https://ugc.production.linktr.ee/4a161591-6bf6-4957-8743-4cc0c5f498e9_286969785-417173286948255-4953446003136974641-n.jpeg', 110),
  ('swingcats-linktree', '스윙캣츠클럽', '루나', '대전·세종', '대전/세종', 36.4800, 127.3000, 'https://linktr.ee/swingcats', 'https://ugc.production.linktr.ee/752bf0db-01f1-4f35-922f-29c8b899f8ce_-------.jpeg', 120),
  ('swinguniverse-linktree', '스윙유니버스', '오나다/스파', '대전·청주', '대전/청주', 36.3504, 127.3845, 'https://linktr.ee/SwingUniverse', 'https://ugc.production.linktr.ee/8043cdbe-32de-419d-881b-26e0166e9139_------------.zip---3.png', 130),
  ('swingpop-linktree', '스윙팝', 'Dialogue/KP댄스홀', '서울', '서울', 37.5665, 126.9780, 'https://linktr.ee/swingpopseoul', 'https://ugc.production.linktr.ee/36ef071d-6893-4818-9e33-ff89b4bd6627_logo.jpeg', 140),
  ('goldenswing-linktree', '골든스윙', '골든스윙', '청주', '청주', 36.6424, 127.4890, 'https://linktr.ee/goldenswing', 'https://ugc.production.linktr.ee/gdUXlMqnTg6QiVZK7V66_qIy9sDf6yGbajCy5', 150)
ON CONFLICT (id) DO UPDATE SET
  community = EXCLUDED.community,
  venue = EXCLUDED.venue,
  region = EXCLUDED.region,
  area = EXCLUDED.area,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  url = EXCLUDED.url,
  logo_source_url = COALESCE(NULLIF(public.swing_oneday_recruit_links.logo_source_url, ''), EXCLUDED.logo_source_url),
  sort_order = EXCLUDED.sort_order,
  is_active = true;

WITH settings AS (
  SELECT value
  FROM public.app_settings
  WHERE key = 'swing_oneday_recruit_link_overrides'
  LIMIT 1
)
UPDATE public.swing_oneday_recruit_links links
SET
  community = COALESCE(NULLIF(settings.value -> links.id ->> 'community', ''), links.community),
  venue = COALESCE(settings.value -> links.id ->> 'venue', links.venue),
  region = COALESCE(NULLIF(settings.value -> links.id ->> 'region', ''), links.region),
  area = COALESCE(NULLIF(settings.value -> links.id ->> 'area', ''), links.area),
  url = COALESCE(NULLIF(settings.value -> links.id ->> 'url', ''), links.url),
  logo_source_url = COALESCE(NULLIF(settings.value -> links.id ->> 'logoSourceUrl', ''), NULLIF(settings.value -> links.id -> 'logo' ->> 'sourceUrl', ''), links.logo_source_url),
  logo_micro = COALESCE(NULLIF(settings.value -> links.id -> 'logo' ->> 'micro', ''), links.logo_micro),
  logo_thumbnail = COALESCE(NULLIF(settings.value -> links.id -> 'logo' ->> 'thumbnail', ''), links.logo_thumbnail),
  logo_medium = COALESCE(NULLIF(settings.value -> links.id -> 'logo' ->> 'medium', ''), links.logo_medium),
  logo_full = COALESCE(NULLIF(settings.value -> links.id -> 'logo' ->> 'full', ''), links.logo_full),
  logo_storage_path = COALESCE(NULLIF(settings.value -> links.id -> 'logo' ->> 'storagePath', ''), links.logo_storage_path),
  logo_updated_at = COALESCE((NULLIF(settings.value -> links.id -> 'logo' ->> 'updatedAt', ''))::timestamptz, links.logo_updated_at),
  lat = COALESCE((settings.value -> links.id -> 'coordinates' ->> 'lat')::double precision, links.lat),
  lng = COALESCE((settings.value -> links.id -> 'coordinates' ->> 'lng')::double precision, links.lng)
FROM settings
WHERE settings.value ? links.id;

DROP POLICY IF EXISTS "Public can update oneday recruit links" ON public.app_settings;
DROP POLICY IF EXISTS "Public can insert oneday recruit links" ON public.app_settings;
