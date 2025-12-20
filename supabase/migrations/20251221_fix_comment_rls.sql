-- Ensure UPDATE policy exists for board_comments
DROP POLICY IF EXISTS "Users can update own comments" ON board_comments;

CREATE POLICY "Users can update own comments" ON board_comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Ensure DELETE policy exists as well (just in case)
DROP POLICY IF EXISTS "Users can delete own comments" ON board_comments;

CREATE POLICY "Users can delete own comments" ON board_comments
  FOR DELETE USING (auth.uid() = user_id);
