-- Update admin check functions to also check JWT app_metadata
-- This prevents RLS violations for admins who have the flag but aren't in board_admins

CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = auth.uid()
  ) OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = auth.uid()
  ) OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;
