DROP POLICY IF EXISTS "Public can update oneday recruit links" ON public.app_settings;
DROP POLICY IF EXISTS "Public can insert oneday recruit links" ON public.app_settings;

CREATE POLICY "Public can update oneday recruit links"
ON public.app_settings
FOR UPDATE
TO anon, authenticated
USING (key = 'swing_oneday_recruit_link_overrides')
WITH CHECK (key = 'swing_oneday_recruit_link_overrides');

CREATE POLICY "Public can insert oneday recruit links"
ON public.app_settings
FOR INSERT
TO anon, authenticated
WITH CHECK (key = 'swing_oneday_recruit_link_overrides');
