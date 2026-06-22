import { getMysqlPool } from './mysql-pool.js';
import { getCurrentUser, requireAdmin } from './auth-api.js';
import { removeEventUploads } from './upload-cleanup.js';
import {
  attachEventAuthors,
  canManageEvent,
  sanitizeEventForViewer,
  sanitizeEventsForViewer,
} from './event-security.js';
import crypto from 'node:crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const tableName = /^[a-z0-9_]+$/i.test(process.env.MYSQL_EVENTS_TABLE || '')
  ? process.env.MYSQL_EVENTS_TABLE
  : 'events';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateObject(value) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return formatDateObject(value);
  const str = String(value);
  const dateOnly = str.slice(0, 10);
  if (DATE_RE.test(dateOnly) && !str.includes('T')) return dateOnly;

  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) return formatDateObject(date);
  return DATE_RE.test(dateOnly) ? dateOnly : '';
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return parseJson(value, []);
  return [];
}

function isInRange(event, start, end) {
  if (!start || !end) return true;

  const eventDates = normalizeArray(event.event_dates);
  if (eventDates.some((date) => date >= start && date <= end)) return true;

  const startDate = normalizeDate(event.start_date || event.date);
  const endDate = normalizeDate(event.end_date || event.start_date || event.date);
  return !!startDate && !!endDate && startDate <= end && endDate >= start;
}

function rowToEvent(row) {
  const raw = parseJson(row.raw_json, {});
  const dateValue = normalizeDate(raw.date) || normalizeDate(row.date_value);
  const startDate = normalizeDate(raw.start_date) || normalizeDate(row.start_date) || dateValue;
  const endDate = normalizeDate(raw.end_date) || normalizeDate(row.end_date) || startDate || dateValue;
  const event = {
    ...raw,
    id: raw.id ?? row.id,
    title: raw.title ?? row.title,
    date: dateValue || raw.date || row.date_value,
    start_date: startDate || raw.start_date || row.start_date,
    end_date: endDate || raw.end_date || row.end_date,
    event_dates: raw.event_dates ?? parseJson(row.event_dates_json, []),
    time: raw.time ?? row.time_text,
    location: raw.location ?? row.location,
    location_link: raw.location_link ?? row.location_link,
    category: raw.category ?? row.category,
    genre: raw.genre ?? row.genre,
    dance_scope: raw.dance_scope ?? row.dance_scope,
    activity_type: raw.activity_type ?? row.activity_type,
    image: raw.image ?? row.image_url,
    image_thumbnail: raw.image_thumbnail ?? row.image_thumbnail,
    image_medium: raw.image_medium ?? row.image_medium,
    description: raw.description ?? row.description,
    link1: raw.link1 ?? row.link1,
    link_name1: raw.link_name1 ?? row.link_name1,
    group_id: raw.group_id ?? row.group_id,
    venue_name: raw.venue_name ?? row.venue_name,
    address: raw.address ?? row.address,
    created_at: raw.created_at ?? row.created_at,
    updated_at: raw.updated_at ?? row.updated_at,
  };

  event.event_dates = normalizeArray(event.event_dates);
  event.dance_tags = normalizeArray(event.dance_tags);
  event.venues = event.venues || (event.address ? { address: event.address } : null);

  return event;
}

function toDateOrNull(value) {
  const date = normalizeDate(value);
  return date || null;
}

function toDateTimeOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeEventPayload(input, existing = null, user = null) {
  const source = {
    ...(existing || {}),
    ...(input || {}),
  };

  const now = new Date().toISOString();
  const id = String(source.id || crypto.randomUUID());
  const title = String(source.title || '').trim();

  if (!title) {
    const error = new Error('이벤트 제목이 필요합니다.');
    error.statusCode = 400;
    throw error;
  }

  const date = toDateOrNull(source.date || source.start_date);
  const startDate = toDateOrNull(source.start_date || source.date);
  const endDate = toDateOrNull(source.end_date || source.start_date || source.date);
  const eventDates = Array.isArray(source.event_dates) ? source.event_dates.filter(Boolean) : [];

  const event = {
    ...source,
    id,
    title,
    date,
    start_date: startDate,
    end_date: endDate,
    event_dates: eventDates,
    time: source.time || '',
    location: source.location || '',
    location_link: source.location_link || '',
    category: source.category || 'event',
    genre: source.genre || null,
    dance_scope: source.dance_scope || 'swing',
    activity_type: source.activity_type || source.category || 'event',
    image: source.image || source.image_url || source.image_full || source.image_medium || source.image_thumbnail || '',
    image_thumbnail: source.image_thumbnail || '',
    image_medium: source.image_medium || '',
    description: source.description || '',
    link1: source.link1 || '',
    link_name1: source.link_name1 || '',
    group_id: toIntOrNull(source.group_id),
    venue_name: source.venue_name || source.place_name || '',
    address: source.address || '',
    user_id: user?.is_admin
      ? (source.user_id || user?.id || null)
      : (user?.id || source.user_id || null),
    organizer: source.organizer || user?.nickname || source.organizer_name || 'Swing Enjoy',
    organizer_name: source.organizer_name || user?.nickname || '',
    created_at: source.created_at || now,
    updated_at: now,
  };

  delete event.password;
  delete event.board_users;
  delete event._method;
  return event;
}

async function findRawEvent(id) {
  const pool = getMysqlPool();
  const [rows] = await pool.execute(`SELECT raw_json FROM ${tableName} WHERE id = ? LIMIT 1`, [String(id)]);
  if (!rows[0]) return null;
  return parseJson(rows[0].raw_json, null);
}

async function requireEventOwnerOrAdmin(req, event) {
  const user = await getCurrentUser(req);
  if (!user) {
    const error = new Error('로그인이 필요합니다.');
    error.statusCode = 401;
    throw error;
  }

  if (canManageEvent(user, event)) {
    return user;
  }

  const error = new Error('수정 권한이 없습니다.');
  error.statusCode = 403;
  throw error;
}

async function saveEvent(event) {
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO ${tableName} (
       id, title, date_value, start_date, end_date, event_dates_json, time_text,
       location, location_link, category, genre, dance_scope, activity_type,
       image_url, image_thumbnail, image_medium, description, link1, link_name1,
       group_id, venue_name, address, created_at, updated_at, raw_json, import_batch
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
       imported_at = CURRENT_TIMESTAMP`,
    [
      String(event.id),
      event.title,
      toDateOrNull(event.date),
      toDateOrNull(event.start_date),
      toDateOrNull(event.end_date),
      JSON.stringify(event.event_dates || []),
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
      toIntOrNull(event.group_id),
      event.venue_name || null,
      event.address || null,
      toDateTimeOrNull(event.created_at),
      toDateTimeOrNull(event.updated_at),
      JSON.stringify(event),
      'manual',
    ],
  );
}

function buildWhere({ start, end, cutoff, scope, id, q }) {
  const where = [];
  const params = [];

  if (id) {
    where.push('id = ?');
    params.push(String(id));
  }

  if (start && end) {
    where.push(`(
      (start_date IS NOT NULL AND COALESCE(end_date, start_date, date_value) >= ? AND start_date <= ?)
      OR (date_value IS NOT NULL AND date_value BETWEEN ? AND ?)
      OR (event_dates_json IS NOT NULL AND event_dates_json <> '[]')
    )`);
    params.push(start, end, start, end);
  } else if (cutoff) {
    where.push('COALESCE(end_date, start_date, date_value) >= ?');
    params.push(cutoff);
  }

  if (scope) {
    if (scope === 'swing') {
      where.push("(dance_scope IS NULL OR dance_scope = '' OR dance_scope = 'swing')");
    } else {
      where.push('dance_scope = ?');
      params.push(scope);
    }
  }

  if (q) {
    where.push('(title LIKE ? OR description LIKE ? OR location LIKE ? OR venue_name LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

export async function listCafe24Events(req, res) {
  const start = normalizeDate(req.query.start || req.query.startDate);
  const end = normalizeDate(req.query.end || req.query.endDate);
  const cutoff = normalizeDate(req.query.cutoff);
  const scope = String(req.query.scope || req.query.danceScope || '').trim();
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 1000), 1), 3000);
  const limitSql = String(limit);

  if ((req.query.start || req.query.startDate || req.query.end || req.query.endDate) && (!start || !end)) {
    res.status(400).json({ error: 'start and end must be YYYY-MM-DD' });
    return;
  }

  const { sql, params } = buildWhere({ start, end, cutoff, scope, q });
  const pool = getMysqlPool();
  const user = await getCurrentUser(req);
  const [rows] = await pool.execute(
    `SELECT *
      FROM ${tableName}
       ${sql}
      ORDER BY COALESCE(start_date, date_value) ASC, time_text ASC, id ASC
      LIMIT ${limitSql}`,
    params,
  );

  const events = await attachEventAuthors(rows
    .map(rowToEvent)
    .filter((event) => isInRange(event, start, end)));

  res.json({
    backend: 'cafe24-mysql',
    count: events.length,
    events: sanitizeEventsForViewer(events, user),
  });
}

export async function getCafe24Event(req, res) {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  const { sql, params } = buildWhere({ id });
  const pool = getMysqlPool();
  const user = await getCurrentUser(req);
  const [rows] = await pool.execute(`SELECT * FROM ${tableName} ${sql} LIMIT 1`, params);
  const event = rows[0] ? (await attachEventAuthors([rowToEvent(rows[0])]))[0] : null;

  if (!event) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  res.json({ backend: 'cafe24-mysql', event: sanitizeEventForViewer(event, user) });
}

export async function createCafe24Event(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  const event = normalizeEventPayload(req.body, null, user);
  await saveEvent(event);
  res.status(201).json({ ok: true, event: sanitizeEventForViewer((await attachEventAuthors([event]))[0], user) });
}

export async function updateCafe24Event(req, res) {
  const existing = await findRawEvent(req.params.id);

  if (!existing) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  const user = await requireEventOwnerOrAdmin(req, existing);
  const event = normalizeEventPayload({ ...req.body, id: req.params.id }, existing, user);
  await saveEvent(event);
  res.json({ ok: true, event: sanitizeEventForViewer((await attachEventAuthors([event]))[0], user) });
}

export async function deleteCafe24Event(req, res) {
  const existing = await findRawEvent(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  await requireEventOwnerOrAdmin(req, existing);
  const imageCleanup = await removeEventUploads(existing);
  const pool = getMysqlPool();
  const [result] = await pool.execute(`DELETE FROM ${tableName} WHERE id = ?`, [String(req.params.id)]);

  if (!result.affectedRows) {
    res.status(404).json({ error: 'event not found' });
    return;
  }

  res.json({
    ok: true,
    id: String(req.params.id),
    deletedImages: imageCleanup.count,
    deletedImageUrls: imageCleanup.urls,
    deletedStoragePath: imageCleanup.storagePath,
  });
}
