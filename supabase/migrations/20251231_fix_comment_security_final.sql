-- 1. 일반 게시판(board_comments) RLS 정책 수정
-- 일반 게시판은 기획 의도에 따라 "로그인한 작성자만" 비번 없이 삭제할 수 있도록 설정합니다.
DROP POLICY IF EXISTS "Users can delete own comments" ON public.board_comments;

CREATE POLICY "Users can delete own comments" ON public.board_comments 
FOR DELETE USING ( auth.uid() = user_id );

-- 2. 일반 게시판용 비번 삭제 RPC 제거 (사용하지 않으므로 삭제)
DROP FUNCTION IF EXISTS public.delete_comment_with_password(bigint, text);

-- 3. 익명 게시판(board_anonymous_comments) 전용 삭제 RPC 함수 (유지 및 강화)
-- 익명 게시판은 로그인 정보가 없으므로 비밀번호 대조가 필수입니다.
CREATE OR REPLACE FUNCTION public.delete_anonymous_comment_with_password(
    p_comment_id bigint,
    p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows_deleted int;
BEGIN
    -- 비밀번호가 일치하는 경우만 삭제 수행
    DELETE FROM public.board_anonymous_comments
    WHERE id = p_comment_id 
    AND password = p_password;
    
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RETURN v_rows_deleted > 0;
END;
$$;

-- 4. 권한 부여
GRANT EXECUTE ON FUNCTION public.delete_anonymous_comment_with_password(bigint, text) TO anon, authenticated;

-- 5. 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
