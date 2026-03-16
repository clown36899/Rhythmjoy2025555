-- Add attached_images column to webzine_posts
alter table public.webzine_posts add column if not exists attached_images jsonb default '[]'::jsonb;

-- Create increment_webzine_view RPC
create or replace function public.increment_webzine_view(row_id bigint)
returns void as $$
begin
  update public.webzine_posts
  set views = views + 1
  where id = row_id;
end;
$$ language plpgsql security definer;

-- Grant permissions
grant execute on function public.increment_webzine_view(bigint) to anon, authenticated;
