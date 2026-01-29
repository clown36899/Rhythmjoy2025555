-- 1. Remove UNIQUE constraint from user_id to allow multi-device support
ALTER TABLE public.user_push_subscriptions 
DROP CONSTRAINT IF EXISTS user_push_subscriptions_user_id_key;

-- 2. Add user_agent column to track device type
ALTER TABLE public.user_push_subscriptions 
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 3. Add endpoint column for easier querying/deleting (extracted from subscription json)
ALTER TABLE public.user_push_subscriptions 
ADD COLUMN IF NOT EXISTS endpoint TEXT;

-- 4. Backfill endpoint from JSON if exists (optional cleanup)
UPDATE public.user_push_subscriptions 
SET endpoint = subscription->>'endpoint'
WHERE endpoint IS NULL;

-- 5. Create index on endpoint to find/delete efficiently
CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_endpoint ON public.user_push_subscriptions(endpoint);
