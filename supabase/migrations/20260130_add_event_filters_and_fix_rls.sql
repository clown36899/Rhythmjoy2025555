-- 1. Add granular filter column
ALTER TABLE public.user_push_subscriptions 
ADD COLUMN IF NOT EXISTS pref_filter_tags text[] DEFAULT NULL;

-- 2. Reset and Fix RLS Policies (Crucial for user updates)
-- First, verify RLS is enabled
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Grant access
GRANT ALL ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Enable read access for own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Enable update for own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Enable delete for own subscriptions" ON public.user_push_subscriptions;

-- Create correct policies
CREATE POLICY "Users can view their own subscriptions" 
ON public.user_push_subscriptions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" 
ON public.user_push_subscriptions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" 
ON public.user_push_subscriptions FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions" 
ON public.user_push_subscriptions FOR DELETE 
USING (auth.uid() = user_id);

-- Admin policy (Hardcoded for safety as per previous context, or use app_metadata)
CREATE POLICY "Admins can view all subscriptions" 
ON public.user_push_subscriptions FOR SELECT 
USING (
  (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  OR 
  auth.email() = 'clown313@naver.com'
);
