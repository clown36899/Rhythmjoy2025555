DROP POLICY IF EXISTS "관리자는 모든 사이트 모음을 볼 수 있습니다." ON public.site_links;
CREATE POLICY "관리자는 모든 사이트 모음을 볼 수 있습니다."
ON public.site_links
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.board_admins WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "작성자 또는 관리자는 사이트 모음을 수정할 수 있습니다." ON public.site_links;
CREATE POLICY "작성자 또는 관리자는 사이트 모음을 수정할 수 있습니다."
ON public.site_links
FOR UPDATE
USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.board_admins WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "작성자 또는 관리자는 사이트 모음을 삭제할 수 있습니다." ON public.site_links;
CREATE POLICY "작성자 또는 관리자는 사이트 모음을 삭제할 수 있습니다."
ON public.site_links
FOR DELETE
USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.board_admins WHERE user_id = auth.uid())
);
