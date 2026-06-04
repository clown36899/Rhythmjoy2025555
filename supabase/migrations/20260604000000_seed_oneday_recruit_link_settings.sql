INSERT INTO public.app_settings (key, value, description)
VALUES (
  'swing_oneday_recruit_link_overrides',
  '{}'::jsonb,
  'Swing one-day recruit link overrides edited by logged-in users'
)
ON CONFLICT (key) DO NOTHING;
