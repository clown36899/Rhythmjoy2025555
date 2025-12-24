-- Function to verify password and delete anonymous comment securely
create or replace function delete_anonymous_comment_with_password(
  p_comment_id uuid,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_deleted int;
begin
  -- Delete the comment only if the ID and password match
  delete from board_anonymous_comments
  where id = p_comment_id
  and password = p_password;
  
  get diagnostics v_rows_deleted = row_count;
  
  -- Return true if a row was deleted, false otherwise
  return v_rows_deleted > 0;
end;
$$;
