-- Move tables from private to public schema
-- This is necessary because Supabase JS Client (used by key-gen script and Netlify functions)
-- interacts via the REST API, which by default only exposes the 'public' schema.
-- To maintain security, we will Enable RLS and create NO policies (denying all public access).
-- Only the 'service_role' key (used by Admin/Backend) can bypass this.

-- 1. Move system_keys
ALTER TABLE private.system_keys SET SCHEMA public;

-- 2. Move user_tokens
ALTER TABLE private.user_tokens SET SCHEMA public;

-- 3. Ensure RLS is enabled (It should be, but let's be safe)
ALTER TABLE public.system_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

-- 4. Drop the private schema if empty/unused (Optional, keeping it doesn't hurt)
-- DROP SCHEMA private;
