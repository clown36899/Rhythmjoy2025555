-- Create private schema
CREATE SCHEMA IF NOT EXISTS private;

-- Secure schema access
GRANT USAGE ON SCHEMA private TO service_role;
REVOKE ALL ON SCHEMA private FROM anon, authenticated, public;

-- Table for User Tokens (Encrypted with Public Key)
CREATE TABLE IF NOT EXISTS private.user_tokens (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_token TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id)
);

-- Table for System Keys (Public Key + Encrypted Private Key)
-- Singleton table (only 1 row expected)
CREATE TABLE IF NOT EXISTS private.system_keys (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL, /* Encrypted with Master Password */
    salt TEXT NOT NULL, /* For password hashing/key derivation */
    iv TEXT NOT NULL, /* For private key encryption */
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Board Users (Public Profile Only)
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

ALTER TABLE public.board_users ENABLE ROW LEVEL SECURITY;

-- Policies for board_users
DROP POLICY IF EXISTS "Public read access" ON public.board_users;
CREATE POLICY "Public read access" ON public.board_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "User update own" ON public.board_users;
CREATE POLICY "User update own" ON public.board_users FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access" ON public.board_users;
CREATE POLICY "Service role full access" ON public.board_users FOR ALL TO service_role USING (true) WITH CHECK (true);
