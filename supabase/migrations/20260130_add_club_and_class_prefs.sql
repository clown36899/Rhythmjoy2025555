-- 1. Add new columns for Club toggle and Class filters
-- pref_clubs: Simple boolean for "Club Lessons" category (No sub-filters needed)
-- pref_filter_class_genres: Array of text for "Class" category sub-filters
ALTER TABLE public.user_push_subscriptions 
ADD COLUMN IF NOT EXISTS pref_clubs boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pref_filter_class_genres text[] DEFAULT NULL;

-- 2. Grant permissions (just in case)
GRANT ALL ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;

-- 3. Force schema cache refresh
NOTIFY pgrst, 'reload schema';
