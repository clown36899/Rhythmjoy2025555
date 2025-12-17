-- Create a private schema if it doesn't exist (useful for hiding tables from public API)
CREATE SCHEMA IF NOT EXISTS private;

-- Grant usage on private schema to service_role only (secure)
GRANT USAGE ON SCHEMA private TO service_role;
REVOKE ALL ON SCHEMA private FROM anon, authenticated, public;

-- Create table for storing Kakao Refresh Tokens securey
CREATE TABLE IF NOT EXISTS private.user_tokens (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id)
);

-- Ensure board_users has the correct columns (No PII)
-- accessing public.board_users
CREATE TABLE IF NOT EXISTS public.board_users (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kakao_id TEXT,
    nickname TEXT NOT NULL,
    profile_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT board_users_user_id_key UNIQUE (user_id)
);

-- Enable RLS on board_users
ALTER TABLE public.board_users ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view nicknames (for community features)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.board_users;
CREATE POLICY "Enable read access for all users" ON public.board_users
    FOR SELECT USING (true);

-- Policy: Users can update their own nickname/image
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.board_users;
CREATE POLICY "Enable update for users based on user_id" ON public.board_users
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Service Role (Admin/Backend) has full access
DROP POLICY IF EXISTS "Enable all access for service role" ON public.board_users;
CREATE POLICY "Enable all access for service role" ON public.board_users
    FOR ALL TO service_role USING (true) WITH CHECK (true);
