-- Drop existing table if exists for a clean slate
DROP TABLE IF EXISTS public.user_push_subscriptions CASCADE;

-- Create user_push_subscriptions table
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    subscription JSONB NOT NULL,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.user_push_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- 2. Users can insert their own subscriptions
CREATE POLICY "Users can insert their own subscriptions"
ON public.user_push_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. Users can update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
ON public.user_push_subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

-- 4. Users can delete their own subscriptions
CREATE POLICY "Users can delete their own subscriptions"
ON public.user_push_subscriptions
FOR DELETE
USING (auth.uid() = user_id);

-- 5. Admins can view all subscriptions (for testing/debug)
-- Note: Assuming you have an is_admin flag in your board_users or similar, 
-- but here we'll use a simple check if the user is an admin by email for safety in testing.
-- Alternatively, we can use the app_metadata is_admin if it's set.
CREATE POLICY "Admins can view all subscriptions"
ON public.user_push_subscriptions
FOR SELECT
USING (
  (SELECT auth.email()) = 'clown313@naver.com' -- Admin email
  OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
);

-- Add unique constraint on user_id + subscription to avoid duplicates if needed, 
-- but usually subscription involves endpoint which is unique.
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_user_push_subscription_endpoint ON public.user_push_subscriptions ((subscription->>'endpoint'));

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_push_subscriptions_updated_at
    BEFORE UPDATE ON public.user_push_subscriptions
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
