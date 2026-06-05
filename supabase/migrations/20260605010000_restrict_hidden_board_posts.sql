-- Keep hidden board posts private to admins at the database policy layer.

DROP POLICY IF EXISTS "Anyone can read posts" ON "public"."board_posts";
DROP POLICY IF EXISTS "board_posts_select_public" ON "public"."board_posts";

CREATE POLICY "board_posts_select_visible_or_admin"
ON "public"."board_posts"
FOR SELECT
USING (
  COALESCE("is_hidden", false) = false
  OR "public"."is_admin_user"()
);
