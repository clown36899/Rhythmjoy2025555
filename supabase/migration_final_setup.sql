-- [Final Setup] Secure Kakao Login Tables
-- Run this script in the Supabase SQL Editor to fully reset/setup the necessary tables.

-- 1. Clean up old tables (if they exist in wrong places)
DROP TABLE IF EXISTS private.system_keys CASCADE;
DROP TABLE IF EXISTS private.user_tokens CASCADE;
DROP TABLE IF EXISTS public.system_keys CASCADE;
DROP TABLE IF EXISTS public.user_tokens CASCADE;

-- 2. Create 'system_keys' table in PUBLIC schema (easier access, protected by RLS)
CREATE TABLE public.system_keys (
  id integer PRIMARY KEY,
  public_key text NOT NULL,
  encrypted_private_key text NOT NULL,
  salt text NOT NULL,
  iv text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create 'user_tokens' table in PUBLIC schema
CREATE TABLE public.user_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable Row Level Security (RLS) - CRITICAL FOR SECURITY
ALTER TABLE public.system_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies: DENY ALL access by default, allow ONLY Service Role (Backend)
-- No policies for "anon" or "authenticated" means they cannot read/write.
-- Service_role bypasses RLS automatically.

-- Just to be explicit (Supabase default is deny all if no policy, but explicit is good)
CREATE POLICY "Allow Service Role Full Access" ON public.system_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow Service Role Full Access" ON public.user_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Cleanup 'board_users' (Remove PII if exists)
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'board_users' AND column_name = 'real_name') THEN
    ALTER TABLE public.board_users DROP COLUMN real_name;
  END IF;
  
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'board_users' AND column_name = 'phone') THEN
    ALTER TABLE public.board_users DROP COLUMN phone;
  END IF;

  -- Ensure other columns exist
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'board_users' AND column_name = 'kakao_id') THEN
    ALTER TABLE public.board_users ADD COLUMN kakao_id text;
  END IF;
  
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'board_users' AND column_name = 'profile_image') THEN
    ALTER TABLE public.board_users ADD COLUMN profile_image text;
  END IF;
END $$;

-- 7. Grant permissions to service_role (just in case)
GRANT ALL ON public.system_keys TO service_role;
GRANT ALL ON public.user_tokens TO service_role;
