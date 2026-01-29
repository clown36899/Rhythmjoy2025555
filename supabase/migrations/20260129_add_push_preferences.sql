-- Add granular preference columns to user_push_subscriptions
ALTER TABLE public.user_push_subscriptions 
ADD COLUMN IF NOT EXISTS pref_events BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS pref_lessons BOOLEAN DEFAULT true;

-- Update existing records to have defaults (though DEFAULT true handles new ones)
UPDATE public.user_push_subscriptions 
SET pref_events = true, pref_lessons = true 
WHERE pref_events IS NULL OR pref_lessons IS NULL;
