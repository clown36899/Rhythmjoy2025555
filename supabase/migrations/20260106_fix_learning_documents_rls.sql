-- Fix RLS for learning_documents to allow updates when author_id is NULL or by admins
-- 문제: author_id가 NULL인 문서는 아무도 수정할 수 없음
-- 해결: author_id가 NULL이거나, 본인이거나, 관리자인 경우 수정 가능

DROP POLICY IF EXISTS "Authors can update their documents" ON public.learning_documents;
DROP POLICY IF EXISTS "Authors can delete their documents" ON public.learning_documents;

-- Update Policy: Allow if author_id is NULL, or user is the author, or user is admin
-- Note: Use auth.jwt() to check email instead of querying auth.users
CREATE POLICY "Users can update documents"
  ON public.learning_documents FOR UPDATE
  TO authenticated
  USING (
    author_id IS NULL OR 
    auth.uid() = author_id OR
    (auth.jwt()->>'email') LIKE '%admin%'
  );

-- Delete Policy: Same logic
CREATE POLICY "Users can delete documents"
  ON public.learning_documents FOR DELETE
  TO authenticated
  USING (
    author_id IS NULL OR 
    auth.uid() = author_id OR
    (auth.jwt()->>'email') LIKE '%admin%'
  );
