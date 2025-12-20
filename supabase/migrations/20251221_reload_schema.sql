-- Force Supabase API to recognize schema changes (like the new comment_count column)
NOTIFY pgrst, 'reload schema';
