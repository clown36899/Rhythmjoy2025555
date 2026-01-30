-- Rename pref_lessons to pref_class to match domain model
ALTER TABLE public.user_push_subscriptions 
RENAME COLUMN pref_lessons TO pref_class;

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';
