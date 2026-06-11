import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const TABLES = [
  'app_settings',
  'billboard_settings',
  'billboard_user_settings',
  'billboard_users',
  'board_admins',
  'board_anonymous_comment_dislikes',
  'board_anonymous_comment_likes',
  'board_anonymous_comments',
  'board_anonymous_dislikes',
  'board_anonymous_likes',
  'board_anonymous_posts',
  'board_banned_words',
  'board_categories',
  'board_comments',
  'board_comment_dislikes',
  'board_comment_likes',
  'board_post_dislikes',
  'board_post_favorites',
  'board_post_likes',
  'board_posts',
  'board_prefixes',
  'board_users',
  'comments',
  'event_favorites',
  'featured_items',
  'global_notices',
  'history_edges',
  'history_nodes',
  'invitation_logs',
  'invitations',
  'item_views',
  'learning_categories',
  'learning_documents',
  'learning_playlists',
  'learning_resources',
  'learning_video_bookmarks',
  'learning_videos',
  'metrics_cache',
  'metronome_presets',
  'notification_queue',
  'practice_room_favorites',
  'practice_rooms',
  'pwa_installs',
  'scraped_events',
  'session_logs',
  'shop_favorites',
  'shops',
  'site_analytics_logs',
  'site_links',
  'site_stats_index',
  'site_usage_stats',
  'social_events',
  'social_group_favorites',
  'social_groups',
  'social_places',
  'social_schedules',
  'system_keys',
  'theme_settings',
  'user_push_subscriptions',
  'venue_edit_logs',
  'venues',
  'webzine_posts',
];

const compositeKeysByTable = {
  event_favorites: ['user_id', 'event_id'],
  board_post_favorites: ['user_id', 'post_id'],
  board_post_likes: ['user_id', 'post_id'],
  board_post_dislikes: ['user_id', 'post_id'],
  board_anonymous_likes: ['user_id', 'post_id'],
  board_anonymous_dislikes: ['user_id', 'post_id'],
  board_comment_likes: ['user_id', 'comment_id'],
  board_comment_dislikes: ['user_id', 'comment_id'],
  board_anonymous_comment_likes: ['fingerprint', 'comment_id'],
  board_anonymous_comment_dislikes: ['fingerprint', 'comment_id'],
  item_views: ['viewer_key', 'item_type', 'item_id'],
  shop_favorites: ['user_id', 'shop_id'],
  practice_room_favorites: ['user_id', 'practice_room_id'],
  social_group_favorites: ['user_id', 'group_id'],
  user_push_subscriptions: ['endpoint'],
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getRecordId(table, row) {
  if ([
    'board_anonymous_likes',
    'board_anonymous_dislikes',
    'board_anonymous_comment_likes',
    'board_anonymous_comment_dislikes',
  ].includes(table)) {
    const itemKey = table.includes('comment') ? row?.comment_id : row?.post_id;
    const actorKey = row?.user_id || row?.session_id || row?.fingerprint;
    if (actorKey !== undefined && actorKey !== null && actorKey !== '' && itemKey !== undefined && itemKey !== null && itemKey !== '') {
      return `${String(actorKey)}:${String(itemKey)}`;
    }
  }

  const composite = compositeKeysByTable[table] || [];
  if (composite.length && composite.every((key) => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '')) {
    return composite.map((key) => String(row[key])).join(':');
  }

  for (const key of ['id', 'code', 'key', 'token', 'endpoint', 'user_id']) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return String(row[key]);
  }

  return JSON.stringify(row).slice(0, 160);
}

function toDateTimeOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function fetchAllRows(supabase, table) {
  const pageSize = Number(process.env.CAFE24_SYNC_PAGE_SIZE || 1000);
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function main() {
  const supabaseUrl = requiredEnv('VITE_PUBLIC_SUPABASE_URL');
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_KEY or VITE_PUBLIC_SUPABASE_ANON_KEY is required');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: requiredEnv('MYSQL_DATABASE'),
    user: requiredEnv('MYSQL_USER'),
    password: requiredEnv('MYSQL_PASSWORD'),
    waitForConnections: true,
    connectionLimit: 4,
  });

  const summary = [];

  for (const table of TABLES) {
    try {
      const rows = await fetchAllRows(supabase, table);
      for (const row of rows) {
        await pool.execute(
          `INSERT INTO generic_records (table_name, record_id, data_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             data_json = VALUES(data_json),
             created_at = VALUES(created_at),
             updated_at = VALUES(updated_at),
             imported_at = CURRENT_TIMESTAMP`,
          [
            table,
            getRecordId(table, row),
            JSON.stringify(row),
            toDateTimeOrNull(row.created_at || row.inserted_at),
            toDateTimeOrNull(row.updated_at || row.modified_at),
          ],
        );
      }
      summary.push({ table, count: rows.length, ok: true });
      console.log(`[generic-sync] ${table}: ${rows.length}`);
    } catch (error) {
      summary.push({ table, count: 0, ok: false, error: error.message });
      console.warn(`[generic-sync] ${table}: ${error.message}`);
    }
  }

  await pool.end();
  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
