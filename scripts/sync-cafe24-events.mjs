import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const EVENT_COLUMNS = [
  'id',
  'title',
  'date',
  'start_date',
  'end_date',
  'event_dates',
  'time',
  'location',
  'location_link',
  'category',
  'genre',
  'dance_scope',
  'dance_genre',
  'activity_type',
  'dance_tags',
  'price',
  'image',
  'image_micro',
  'image_thumbnail',
  'image_medium',
  'image_full',
  'video_url',
  'description',
  'organizer',
  'organizer_name',
  'organizer_phone',
  'contact',
  'capacity',
  'registered',
  'link1',
  'link2',
  'link3',
  'link_name1',
  'link_name2',
  'link_name3',
  'created_at',
  'updated_at',
  'user_id',
  'show_title_on_billboard',
  'venue_id',
  'venue_name',
  'venue_custom_link',
  'storage_path',
  'address',
  'scope',
  'views',
  'group_id',
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function toDate(value) {
  if (!value) return null;
  const str = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

function toDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchAllEvents() {
  const supabase = createClient(
    required('VITE_PUBLIC_SUPABASE_URL'),
    process.env.SUPABASE_SERVICE_KEY || required('VITE_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const pageSize = 1000;
  const events = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS.join(','))
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    events.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return events;
}

function rowValues(event, batchId) {
  const sanitized = { ...event };
  delete sanitized.password;

  return [
    String(event.id),
    event.title || '',
    toDate(event.date),
    toDate(event.start_date),
    toDate(event.end_date),
    toJson(event.event_dates || []),
    event.time || null,
    event.location || null,
    event.location_link || null,
    event.category || null,
    event.genre || null,
    event.dance_scope || null,
    event.activity_type || null,
    event.image || null,
    event.image_thumbnail || null,
    event.image_medium || null,
    event.description || null,
    event.link1 || null,
    event.link_name1 || null,
    toInt(event.group_id),
    event.venue_name || null,
    event.address || null,
    toDateTime(event.created_at),
    toDateTime(event.updated_at),
    JSON.stringify(sanitized),
    batchId,
  ];
}

async function main() {
  const events = await fetchAllEvents();
  const batchId = randomUUID();
  const tableName = process.env.MYSQL_EVENTS_TABLE || 'events';

  if (!/^[a-z0-9_]+$/i.test(tableName)) {
    throw new Error(`Invalid MYSQL_EVENTS_TABLE: ${tableName}`);
  }

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || 'swingenjoy_app',
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    charset: 'utf8mb4',
    timezone: '+09:00',
  });

  const sql = `
    INSERT INTO ${tableName} (
      id, title, date_value, start_date, end_date, event_dates_json, time_text,
      location, location_link, category, genre, dance_scope, activity_type, image_url,
      image_thumbnail, image_medium, description, link1, link_name1, group_id,
      venue_name, address, created_at, updated_at, raw_json, import_batch
    ) VALUES (${Array.from({ length: 26 }, () => '?').join(',')})
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      date_value = VALUES(date_value),
      start_date = VALUES(start_date),
      end_date = VALUES(end_date),
      event_dates_json = VALUES(event_dates_json),
      time_text = VALUES(time_text),
      location = VALUES(location),
      location_link = VALUES(location_link),
      category = VALUES(category),
      genre = VALUES(genre),
      dance_scope = VALUES(dance_scope),
      activity_type = VALUES(activity_type),
      image_url = VALUES(image_url),
      image_thumbnail = VALUES(image_thumbnail),
      image_medium = VALUES(image_medium),
      description = VALUES(description),
      link1 = VALUES(link1),
      link_name1 = VALUES(link_name1),
      group_id = VALUES(group_id),
      venue_name = VALUES(venue_name),
      address = VALUES(address),
      created_at = VALUES(created_at),
      updated_at = VALUES(updated_at),
      raw_json = VALUES(raw_json),
      import_batch = VALUES(import_batch),
      imported_at = CURRENT_TIMESTAMP
  `;

  await connection.beginTransaction();
  try {
    for (const event of events) {
      await connection.execute(sql, rowValues(event, batchId));
    }

    const pruneMissing = process.env.CAFE24_SYNC_PRUNE === 'true';
    const [deleteResult] = pruneMissing
      ? await connection.execute(
        `DELETE FROM ${tableName} WHERE import_batch <> ?`,
        [batchId],
      )
      : [{ affectedRows: 0 }];

    await connection.commit();
    console.log(JSON.stringify({
      ok: true,
      source: 'supabase-readonly',
      target: 'cafe24-mysql',
      fetched: events.length,
      upserted: events.length,
      pruned: deleteResult.affectedRows || 0,
      pruneMissing,
      batchId,
    }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
