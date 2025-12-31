-- Function to get user info by Kakao ID (Optimized 1 RT)
-- Returns user_id, email, nickname, profile_image
-- Security: DEFINER to access auth.users
create or replace function public.get_kakao_user_info(p_kakao_id text)
returns table (
  user_id uuid,
  email varchar,
  nickname varchar,
  profile_image text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    bu.user_id,
    au.email::varchar,
    bu.nickname,
    bu.profile_image
  from public.board_users bu
  join auth.users au on bu.user_id = au.id
  where bu.kakao_id = p_kakao_id
  limit 1;
end;
$$;
