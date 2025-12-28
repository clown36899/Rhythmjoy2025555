#!/bin/bash
# Supabase Migration Repair Script
# This syncs the local migration history with the remote database

echo "🔧 Repairing Supabase migration history..."

# Mark all migrations as applied
npx supabase migration repair --status applied 20241224_add_anonymous_board
npx supabase migration repair --status applied 20241224_add_comment_interactions
npx supabase migration repair --status applied 20241224_add_password_to_comments
npx supabase migration repair --status applied 20241224_add_password_to_posts
npx supabase migration repair --status applied 20241224_add_secure_board_rpc
npx supabase migration repair --status applied 20241224_fix_missing_columns
npx supabase migration repair --status applied 20241224_separate_anonymous_board
npx supabase migration repair --status applied 20241225_secure_comment_deletion
npx supabase migration repair --status applied 20241226_create_social_group_favorites
npx supabase migration repair --status applied 20241226_separate_board_favorites
npx supabase migration repair --status applied 20250128_create_history_timeline
npx supabase migration repair --status applied 20251218175135_add_rls_to_events
npx supabase migration repair --status applied 20251219_add_board_category
npx supabase migration repair --status applied 20251219_increment_views_rpc
npx supabase migration repair --status applied 20251220_add_admin_by_email
npx supabase migration repair --status applied 20251220_add_image_columns
npx supabase migration repair --status applied 20251220_admin_controls
npx supabase migration repair --status applied 20251220_board_post_likes
npx supabase migration repair --status applied 20251220_denormalize_comment_count
npx supabase migration repair --status applied 20251220_fix_admin_permissions
npx supabase migration repair --status applied 20251220_fix_board_comments_complete
npx supabase migration repair --status applied 20251220_fix_board_comments_fk
npx supabase migration repair --status applied 20251220_fix_comment_count_robust
npx supabase migration repair --status applied 20251220_fix_posts_fk
npx supabase migration repair --status applied 20251220_fix_prefix_final
npx supabase migration repair --status applied 20251220_fix_prefix_permission
npx supabase migration repair --status applied 20251220_fix_recursion
npx supabase migration repair --status applied 20251220_fix_sequence
npx supabase migration repair --status applied 20251220_fix_trigger_security
npx supabase migration repair --status applied 20251220_migrate_unassigned_to_free
npx supabase migration repair --status applied 20251220_nuke_users_dependency
npx supabase migration repair --status applied 20251220_prefix_categories
npx supabase migration repair --status applied 20251220_recreate_prefixes_clean
npx supabase migration repair --status applied 20251220_reset_categories
npx supabase migration repair --status applied 20251220_secure_shopping_mall
npx supabase migration repair --status applied 20251221_add_favorites_tables
npx supabase migration repair --status applied 20251221_add_user_id_to_social_schedules
npx supabase migration repair --status applied 20251221_add_user_id_to_social_schedules_safe
npx supabase migration repair --status applied 20251221_create_app_versions
npx supabase migration repair --status applied 20251221_create_venues
npx supabase migration repair --status applied 20251221_finalize_dev_log_system
npx supabase migration repair --status applied 20251221_fix_comment_rls
npx supabase migration repair --status applied 20251221_fix_practice_favorites_schema
npx supabase migration repair --status applied 20251221_reload_schema
npx supabase migration repair --status applied 20251221_remove_dev_log
npx supabase migration repair --status applied 20251221_setup_dev_log
npx supabase migration repair --status applied 20251222_add_links_to_social_schedules
npx supabase migration repair --status applied 20251222_add_userid_to_venues
npx supabase migration repair --status applied 20251222_add_venue_id_to_social_schedules
npx supabase migration repair --status applied 20251223_admin_view_favorites
npx supabase migration repair --status applied 20251225_add_delete_comment_rpc
npx supabase migration repair --status applied 20251225_auth_only_anon_interactions
npx supabase migration repair --status applied 20251225_update_blind_threshold
npx supabase migration repair --status applied 20251226_add_social_schedule_links
npx supabase migration repair --status applied 20251228_create_app_settings
npx supabase migration repair --status applied 20251228_create_app_settings_backup
npx supabase migration repair --status applied 20251228_fix_events_constraints
npx supabase migration repair --status applied 20251228_fix_events_rls_admin
npx supabase migration repair --status applied 20251228_fix_events_save_permission

echo "✅ Migration history repaired!"
echo "Now you can use 'npx supabase db push' for new migrations"
