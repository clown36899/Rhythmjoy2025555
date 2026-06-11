import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getMysqlPool } from './mysql-pool.js';
import { getCurrentUser, requireAdmin } from './auth-api.js';
import {
  attachEventAuthors,
  canManageEvent,
  sanitizeEventsForViewer,
  userMatchesId,
} from './event-security.js';

const tableNameRe = /^[a-z0-9_-]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateObject(value) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function assertTableName(table) {
  if (!tableNameRe.test(table || '')) {
    const error = new Error('Invalid table name');
    error.statusCode = 400;
    throw error;
  }
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return formatDateObject(value);
  const str = String(value);
  const dateOnly = str.slice(0, 10);
  if (DATE_RE.test(dateOnly) && !str.includes('T')) return dateOnly;

  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) return formatDateObject(date);
  return DATE_RE.test(dateOnly) ? dateOnly : null;
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

const adminOnlyGenericTables = new Set([
  'client_reload_diagnostics',
  'pwa_installs',
  'server_version_diagnostics',
  'session_logs',
  'site_analytics_logs',
  'site_usage_stats',
]);

const adminOnlyRpcNames = new Set([
  'create_usage_snapshot',
  'get_analytics_summary_v2',
  'refresh_site_metrics',
  'refresh_site_stats_index',
]);

const boardUserSelfWritableFields = new Set([
  'nickname',
  'profile_image',
  'updated_at',
]);

function getBodyValues(body = {}) {
  return Array.isArray(body?.values) ? body.values : [body?.values || {}];
}

function isOwnBoardUserRow(user, row) {
  return userMatchesId(user, row?.user_id);
}

function getUserProvider(user) {
  return user?.user_metadata?.provider || user?.app_metadata?.provider || 'email';
}

function normalizeBoardUserSelfValue(value, user, existing = {}) {
  const next = { ...(existing || {}) };
  for (const field of boardUserSelfWritableFields) {
    if (Object.prototype.hasOwnProperty.call(value || {}, field)) {
      next[field] = value[field];
    }
  }
  next.user_id = user.id;
  next.email = user.email || existing?.email || null;
  next.provider = existing?.provider || getUserProvider(user);
  next.updated_at = next.updated_at || new Date().toISOString();
  return next;
}

async function requireBoardUserMutationAccess(req, action = 'query', body = {}) {
  if (!['insert', 'update', 'upsert', 'delete'].includes(action)) return;

  const user = await getCurrentUser(req);
  if (!user) throw httpError('로그인이 필요합니다.', 401);
  if (user.is_admin) return;

  if (['insert', 'upsert'].includes(action)) {
    const values = getBodyValues(body);
    const writesOnlyOwnRows = values.every((row) => !row?.user_id || userMatchesId(user, row.user_id));
    if (!writesOnlyOwnRows) throw httpError('수정 권한이 없습니다.', 403);
  }

  if (['update', 'delete'].includes(action)) {
    const targets = await resolveMutationTargets('board_users', body?.filters || [], body?.orFilters || []);
    if (targets.length && !targets.every((row) => isOwnBoardUserRow(user, row))) {
      throw httpError('수정 권한이 없습니다.', 403);
    }
  }
}

async function requireGenericAccess(req, table, action = 'query', body = {}) {
  if (table === 'pwa_installs' && action === 'insert') {
    const user = await getCurrentUser(req);
    const values = Array.isArray(body?.values) ? body.values : [body?.values || {}];
    const writesOnlyOwnRows = user && values.every((row) => !row?.user_id || userMatchesId(user, row.user_id));
    if (writesOnlyOwnRows) return;
  }

  if (table === 'events' && ['update', 'delete'].includes(action)) {
    const targets = await resolveMutationTargets(table, body?.filters || [], body?.orFilters || []);
    if (!targets.length) return;

    const user = await getCurrentUser(req);
    if (!user) {
      const error = new Error('로그인이 필요합니다.');
      error.statusCode = 401;
      throw error;
    }

    if (user.is_admin || targets.every((row) => canManageEvent(user, row))) return;

    const error = new Error('수정 권한이 없습니다.');
    error.statusCode = 403;
    throw error;
  }

  if (table === 'board_users') {
    await requireBoardUserMutationAccess(req, action, body);
  }

  if (adminOnlyGenericTables.has(table)) {
    await requireAdmin(req);
  }
}

function getRecordId(row, conflictKeys = [], table = '') {
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

  const tableKeys = compositeKeysByTable[table] || [];
  if (tableKeys.length && tableKeys.every((key) => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '')) {
    return tableKeys.map((key) => String(row[key])).join(':');
  }

  for (const key of conflictKeys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
      return String(row[key]);
    }
  }

  for (const key of ['id', 'code', 'key', 'token', 'endpoint', 'user_id']) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
      return String(row[key]);
    }
  }

  return crypto.randomUUID();
}

function ensureId(row, conflictKeys = [], table = '') {
  const next = { ...(row || {}) };
  const recordId = getRecordId(next, conflictKeys, table);
  if (next.id === undefined && !conflictKeys.length) next.id = recordId;
  return { row: next, recordId };
}

function getValue(row, field) {
  if (!field) return undefined;
  if (field.includes('->>')) {
    const [base, key] = field.split('->>');
    const parent = row?.[base];
    return parent && typeof parent === 'object' ? parent[key] : undefined;
  }
  if (field.includes('.')) {
    return field.split('.').reduce((value, part) => value?.[part], row);
  }
  return row?.[field];
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value);
}

function stripQuotes(value) {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (typeof value === 'string' && value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function likeToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let start = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote && input[i - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseExpression(expr) {
  const normalized = expr.trim();
  if (normalized.startsWith('and(') && normalized.endsWith(')')) {
    return {
      type: 'and',
      items: splitTopLevel(normalized.slice(4, -1)).map(parseExpression),
    };
  }

  const parts = normalized.split('.');
  if (parts.length < 3) return null;

  const field = parts.shift();
  let op = parts.shift();
  if (op === 'not' && parts[0] === 'is') {
    op = 'not.is';
    parts.shift();
  }
  const value = stripQuotes(parts.join('.'));
  return { type: 'filter', field, op, value };
}

function matchesFilter(row, filter) {
  if (filter.op?.startsWith('not.') && filter.op !== 'not.is') {
    return !matchesFilter(row, {
      ...filter,
      op: filter.op.slice(4),
    });
  }

  const value = getValue(row, filter.field);
  const expected = stripQuotes(filter.value);

  switch (filter.op) {
    case 'eq':
      return String(comparable(value)) === String(comparable(expected));
    case 'neq':
      return String(comparable(value)) !== String(comparable(expected));
    case 'gt':
      return comparable(value) > comparable(expected);
    case 'gte':
      return comparable(value) >= comparable(expected);
    case 'lt':
      return comparable(value) < comparable(expected);
    case 'lte':
      return comparable(value) <= comparable(expected);
    case 'is':
      return expected === null ? value === null || value === undefined : value === expected;
    case 'not.is':
      return expected === null ? value !== null && value !== undefined : value !== expected;
    case 'like':
    case 'ilike':
      return likeToRegExp(expected).test(String(value || ''));
    case 'in': {
      const values = (Array.isArray(expected) ? expected : String(expected || '')
        .replace(/^\(/, '')
        .replace(/\)$/, '')
        .split(',')
        .map((item) => item.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')));
      return values.includes(String(value));
    }
    case 'cs':
    case 'contains': {
      const actualArray = Array.isArray(value) ? value : [];
      const expectedValue = parseJson(expected, expected);
      const expectedArray = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
      return expectedArray.every((item) => actualArray.some((actual) => JSON.stringify(actual) === JSON.stringify(item) || actual === item));
    }
    default:
      return true;
  }
}

function matchesExpression(row, expression) {
  if (!expression) return true;
  if (expression.type === 'and') return expression.items.every((item) => matchesExpression(row, item));
  return matchesFilter(row, expression);
}

function applyFilters(rows, filters = [], orFilters = []) {
  let nextRows = rows;

  for (const filter of filters) {
    nextRows = nextRows.filter((row) => matchesFilter(row, filter));
  }

  for (const orFilter of orFilters) {
    const expressions = splitTopLevel(orFilter).map(parseExpression).filter(Boolean);
    if (!expressions.length) continue;
    nextRows = nextRows.filter((row) => expressions.some((expression) => matchesExpression(row, expression)));
  }

  return nextRows;
}

function applyOrders(rows, orders = []) {
  const nextRows = [...rows];
  for (const order of [...orders].reverse()) {
    const direction = order.ascending === false ? -1 : 1;
    nextRows.sort((a, b) => {
      const av = getValue(a, order.column);
      const bv = getValue(b, order.column);
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return order.nullsFirst ? -1 : 1;
      if (bEmpty) return order.nullsFirst ? 1 : -1;
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return 0;
    });
  }
  return nextRows;
}

function applyRange(rows, range, limit) {
  if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
    return rows.slice(range.from, range.to + 1);
  }
  if (Number.isFinite(limit)) return rows.slice(0, limit);
  return rows;
}

async function loadRows(table) {
  assertTableName(table);
  const pool = getMysqlPool();

  if (table === 'events') {
    const [rows] = await pool.execute('SELECT raw_json FROM events');
    return rows.map((row) => parseJson(row.raw_json, {}));
  }

  const [rows] = await pool.execute(
    'SELECT data_json FROM generic_records WHERE table_name = ?',
    [table],
  );
  return rows.map((row) => parseJson(row.data_json, {}));
}

async function saveGenericRow(table, row, conflictKeys = []) {
  assertTableName(table);
  const { row: nextRow, recordId } = ensureId(row, conflictKeys, table);
  const now = new Date().toISOString();
  if (!nextRow.created_at) nextRow.created_at = now;
  nextRow.updated_at = nextRow.updated_at || now;

  const pool = getMysqlPool();
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
      recordId,
      JSON.stringify(nextRow),
      toDateTimeOrNull(nextRow.created_at),
      toDateTimeOrNull(nextRow.updated_at),
    ],
  );

  return nextRow;
}

async function saveEventRow(row) {
  const event = { ...(row || {}) };
  const now = new Date().toISOString();
  if (!event.id) event.id = crypto.randomUUID();
  if (!event.title) event.title = 'Untitled';
  if (!event.created_at) event.created_at = now;
  event.updated_at = event.updated_at || now;
  const dateValue = normalizeDate(event.date || event.start_date);
  const startDate = normalizeDate(event.start_date || event.date);
  const endDate = normalizeDate(event.end_date || event.start_date || event.date);
  if (dateValue) event.date = dateValue;
  if (startDate) event.start_date = startDate;
  if (endDate) event.end_date = endDate;

  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO events (
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
      normalizeDate(event.date || event.start_date),
      normalizeDate(event.start_date || event.date),
      normalizeDate(event.end_date || event.start_date || event.date),
      JSON.stringify(Array.isArray(event.event_dates) ? event.event_dates : []),
      event.time || null,
      event.location || null,
      event.location_link || null,
      event.category || null,
      event.genre || null,
      event.dance_scope || null,
      event.activity_type || null,
      event.image || event.image_url || null,
      event.image_thumbnail || event.image || event.image_url || null,
      event.image_medium || event.image || event.image_url || null,
      event.description || null,
      event.link1 || null,
      event.link_name1 || null,
      toIntOrNull(event.group_id),
      event.venue_name || event.location || null,
      event.address || null,
      toDateTimeOrNull(event.created_at),
      toDateTimeOrNull(event.updated_at),
      JSON.stringify(event),
      'generic',
    ],
  );

  return event;
}

async function saveRow(table, row, conflictKeys = []) {
  if (table === 'events') return saveEventRow(row);
  return saveGenericRow(table, row, conflictKeys);
}

async function deleteRows(table, rows) {
  assertTableName(table);
  if (!rows.length) return;
  const pool = getMysqlPool();

  if (table === 'events') {
    await pool.query(
      `DELETE FROM events WHERE id IN (${rows.map(() => '?').join(',')})`,
      rows.map((row) => String(row.id)),
    );
    return;
  }

  await pool.query(
    `DELETE FROM generic_records WHERE table_name = ? AND record_id IN (${rows.map(() => '?').join(',')})`,
    [table, ...rows.map((row) => getRecordId(row, [], table))],
  );
}

async function findRelated(table, field, value) {
  const rows = await loadRows(table);
  return rows.find((row) => String(getValue(row, field)) === String(value)) || null;
}

async function findBoardPrefix(row) {
  if (row.prefix_id !== undefined && row.prefix_id !== null && row.prefix_id !== '') {
    const byId = await findRelated('board_prefixes', 'id', row.prefix_id);
    if (byId) return byId;
  }

  const prefixCode = row.prefix_code || row.prefix;
  if (prefixCode !== undefined && prefixCode !== null && prefixCode !== '') {
    return findRelated('board_prefixes', 'code', prefixCode);
  }

  return null;
}

async function hydrateRows(table, rows, select = '') {
  if (!select || !rows.length) return rows;
  const wantsBoardUser = select.includes('board_users');
  const wantsVenue = select.includes('venues');
  const wantsEvents = select.includes('events(');
  const wantsPosts = select.includes('board_posts');
  const wantsPrefix = select.includes('prefix:board_prefixes') || select.includes('board_prefixes');
  const wantsLinkedVideo = select.includes('linked_video');
  const wantsLinkedDocument = select.includes('linked_document');
  const wantsLinkedPlaylist = select.includes('linked_playlist');
  const wantsLinkedCategory = select.includes('linked_category');

  const nextRows = [];
  for (const row of rows) {
    const next = { ...row };
    if (wantsBoardUser && row.user_id) {
      next.board_users = await findRelated('board_users', 'user_id', row.user_id);
    }
    if (wantsVenue && row.venue_id) {
      next.venues = await findRelated('venues', 'id', row.venue_id);
    }
    if (table === 'event_favorites' && wantsEvents && row.event_id) {
      next.events = await findRelated('events', 'id', row.event_id);
    }
    if (table === 'board_post_favorites' && wantsPosts && row.post_id) {
      next.board_posts = await findRelated('board_posts', 'id', row.post_id);
    }
    if (table === 'board_posts' && wantsPrefix) {
      next.prefix = await findBoardPrefix(row);
    }
    if (table === 'history_nodes') {
      if (wantsLinkedVideo && row.linked_video_id) {
        next.linked_video = await findRelated('learning_resources', 'id', row.linked_video_id);
      }
      if (wantsLinkedDocument && row.linked_document_id) {
        next.linked_document = await findRelated('learning_resources', 'id', row.linked_document_id);
      }
      if (wantsLinkedPlaylist && row.linked_playlist_id) {
        next.linked_playlist = await findRelated('learning_resources', 'id', row.linked_playlist_id);
      }
      if (wantsLinkedCategory && row.linked_category_id) {
        next.linked_category = await findRelated('learning_categories', 'id', row.linked_category_id);
      }
    }
    nextRows.push(next);
  }
  return nextRows;
}

async function hydrateMutationData(table, data, select = '') {
  if (!select || !Array.isArray(data) || !data.length) return data;
  return hydrateRows(table, data, select);
}

function resolveConflictKeys(options = {}) {
  const raw = options.onConflict || '';
  return raw
    ? String(raw).split(',').map((key) => key.trim()).filter(Boolean)
    : [];
}

async function resolveMutationTargets(table, filters, orFilters) {
  const rows = await loadRows(table);
  return applyFilters(rows, filters, orFilters);
}

function responsePayload({ data, error = null, count = null, status = 200 }) {
  return { data, error, count, status, statusText: error ? 'Error' : 'OK' };
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function requireEventWriter(req) {
  const user = await getCurrentUser(req);
  if (!user) throw httpError('로그인이 필요합니다.', 401);
  return user;
}

function normalizeEventInsertValues(values, user) {
  return values.map((row) => {
    const next = { ...(row || {}) };
    next.user_id = user.is_admin ? (next.user_id || user.id) : user.id;
    delete next.password;
    delete next.board_users;
    return next;
  });
}

function normalizeEventUpdateValues(values, user) {
  const next = { ...(values || {}) };
  if (!user.is_admin) {
    delete next.user_id;
  }
  delete next.password;
  delete next.board_users;
  return next;
}

function normalizeEventUpsertValue(value, existing, user) {
  const next = {
    ...(existing || {}),
    ...(value || {}),
  };
  next.user_id = user.is_admin
    ? (next.user_id || user.id)
    : (existing?.user_id || user.id);
  delete next.password;
  delete next.board_users;
  return next;
}

async function eventMutationResponseData(table, data, user, select = '') {
  const hydrated = await hydrateMutationData(table, data, select);
  if (table !== 'events') return hydrated;
  return sanitizeEventsForViewer(await attachEventAuthors(hydrated), user);
}

function asAnalyticsBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === undefined || value === null || value === '') return false;
  return ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
}

function analyticsMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function analyticsUserId(row) {
  if (!row?.user_id) return null;
  return String(row.user_id);
}

function buildAnalyticsIdentityResolver(rows = []) {
  const sessionToUser = new Map();
  const fingerprintToUser = new Map();

  for (const row of rows) {
    const userId = analyticsUserId(row);
    if (!userId) continue;
    if (row?.session_id) sessionToUser.set(String(row.session_id), userId);
    if (row?.fingerprint) fingerprintToUser.set(String(row.fingerprint), userId);
  }

  return {
    userId(row) {
      const directUserId = analyticsUserId(row);
      if (directUserId) return directUserId;
      if (row?.session_id && sessionToUser.has(String(row.session_id))) {
        return sessionToUser.get(String(row.session_id));
      }
      if (row?.fingerprint && fingerprintToUser.has(String(row.fingerprint))) {
        return fingerprintToUser.get(String(row.fingerprint));
      }
      return null;
    },
  };
}

function analyticsIdentifier(row, fallback = '', identity = null) {
  const userId = identity?.userId(row) || analyticsUserId(row);
  if (userId) return `user:${userId}`;
  if (row?.fingerprint) return `fingerprint:${String(row.fingerprint)}`;
  if (row?.session_id) return `session:${String(row.session_id)}`;
  return `unknown:${fallback || 'visitor'}`;
}

function analyticsDateRange(args = {}) {
  const startMs = analyticsMs(args.start_date || args.startDate || args.start);
  const endMs = analyticsMs(args.end_date || args.endDate || args.end);
  return {
    startMs: startMs ?? 0,
    endMs: endMs ?? Date.now(),
  };
}

async function getAnalyticsSummaryV2(args = {}) {
  const excludedPrefix = '91b04b25';
  const { startMs, endMs } = analyticsDateRange(args);
  const logs = await loadRows('site_analytics_logs');
  const sessions = await loadRows('session_logs');
  const boardUsers = await loadRows('board_users');
  const nicknameByUser = new Map(
    boardUsers
      .filter((row) => row?.user_id)
      .map((row) => [String(row.user_id), row.nickname || null]),
  );

  const activityRowsBase = logs
    .map((row, index) => ({ row, index, ms: analyticsMs(row.created_at) }))
    .filter(({ row, ms }) => (
      ms !== null &&
      ms >= startMs &&
      ms <= endMs &&
      !asAnalyticsBool(row.is_admin)
    ));

  const sessionRowsBase = sessions
    .map((row, index) => ({ row, index, ms: analyticsMs(row.session_start || row.created_at) }))
    .filter(({ row, ms }) => (
      ms !== null &&
      ms >= startMs &&
      ms <= endMs &&
      !asAnalyticsBool(row.is_admin)
    ));

  const identity = buildAnalyticsIdentityResolver([
    ...activityRowsBase.map((item) => item.row),
    ...sessionRowsBase.map((item) => item.row),
  ]);

  const activityRows = activityRowsBase.filter(({ row }) => {
    const userId = identity.userId(row);
    return !userId || !userId.startsWith(excludedPrefix);
  });

  const dedupedByBucket = new Map();
  for (const item of activityRows) {
    const identifier = analyticsIdentifier(item.row, item.index, identity);
    const bucket = Math.floor(item.ms / (6 * 60 * 60 * 1000));
    const key = `${identifier}:${bucket}`;
    const existing = dedupedByBucket.get(key);
    if (!existing || item.ms < existing.ms) dedupedByBucket.set(key, item);
  }

  const dedupedVisits = Array.from(dedupedByBucket.values());
  const userStats = new Map();
  for (const item of dedupedVisits) {
    const userId = identity.userId(item.row);
    if (!userId) continue;
    const current = userStats.get(userId) || { user_id: userId, visitCount: 0, visitLogs: [] };
    current.visitCount += 1;
    current.visitLogs.push(item.row.created_at);
    userStats.set(userId, current);
  }

  const durationStats = new Map();
  for (const session of sessionRowsBase.map((item) => item.row)) {
    const userId = identity.userId(session);
    const duration = Number(session?.duration_seconds);
    if (!userId || !Number.isFinite(duration) || duration <= 0) continue;
    const current = durationStats.get(userId) || { total: 0, count: 0 };
    current.total += duration;
    current.count += 1;
    durationStats.set(userId, current);
  }

  const userList = Array.from(userStats.values())
    .map((user) => {
      const duration = durationStats.get(user.user_id);
      return {
        user_id: user.user_id,
        visitCount: user.visitCount,
        visitLogs: user.visitLogs.sort((a, b) => new Date(b).getTime() - new Date(a).getTime()),
        nickname: nicknameByUser.get(user.user_id) || null,
        avgDuration: duration?.count ? Math.round(duration.total / duration.count) : 0,
      };
    })
    .sort((a, b) => b.visitCount - a.visitCount);

  return {
    total_visits: dedupedVisits.length,
    logged_in_visits: dedupedVisits.filter((item) => identity.userId(item.row)).length,
    anonymous_visits: dedupedVisits.filter((item) => !identity.userId(item.row)).length,
    user_list: userList,
  };
}

async function createUsageSnapshot(args = {}) {
  const loggedIn = toIntOrNull(args.p_logged_in ?? args.logged_in ?? args.logged_in_count) || 0;
  const anonymous = toIntOrNull(args.p_anonymous ?? args.anonymous ?? args.anonymous_count) || 0;
  const admin = toIntOrNull(args.p_admin ?? args.admin ?? args.admin_count) || 0;
  const now = new Date().toISOString();
  return saveRow('site_usage_stats', {
    id: crypto.randomUUID(),
    logged_in_count: loggedIn,
    anonymous_count: anonymous,
    admin_count: admin,
    total_count: loggedIn + anonymous + admin,
    snapshot_time: now,
    created_at: now,
    updated_at: now,
  });
}

const countSideEffectsByTable = {
  board_post_likes: { targetTable: 'board_posts', itemField: 'post_id', countField: 'likes' },
  board_post_dislikes: { targetTable: 'board_posts', itemField: 'post_id', countField: 'dislikes' },
  board_anonymous_likes: { targetTable: 'board_anonymous_posts', itemField: 'post_id', countField: 'likes' },
  board_anonymous_dislikes: { targetTable: 'board_anonymous_posts', itemField: 'post_id', countField: 'dislikes' },
  board_comment_likes: { targetTable: 'board_comments', itemField: 'comment_id', countField: 'likes' },
  board_comment_dislikes: { targetTable: 'board_comments', itemField: 'comment_id', countField: 'dislikes' },
  board_anonymous_comment_likes: { targetTable: 'board_anonymous_comments', itemField: 'comment_id', countField: 'likes' },
  board_anonymous_comment_dislikes: { targetTable: 'board_anonymous_comments', itemField: 'comment_id', countField: 'dislikes' },
  board_comments: { targetTable: 'board_posts', itemField: 'post_id', countField: 'comment_count' },
  board_anonymous_comments: { targetTable: 'board_anonymous_posts', itemField: 'post_id', countField: 'comment_count' },
};

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== '').map(String)));
}

async function recomputeCountSideEffects(table, rows = []) {
  const config = countSideEffectsByTable[table];
  if (!config || !rows.length) return;

  const affectedIds = uniqueStrings(rows.map((row) => row?.[config.itemField]));
  if (!affectedIds.length) return;

  const sourceRows = await loadRows(table);
  const targetRows = await loadRows(config.targetTable);
  const now = new Date().toISOString();

  for (const id of affectedIds) {
    const count = sourceRows.filter((row) => String(row?.[config.itemField]) === id).length;
    const target = targetRows.find((row) => String(row?.id) === id);
    if (target) {
      await saveRow(config.targetTable, {
        ...target,
        [config.countField]: count,
        updated_at: target.updated_at === undefined ? undefined : now,
      });
    }
  }
}

function sortRows(rows, field = 'display_order') {
  return [...rows].sort((a, b) => {
    const av = Number(a?.[field] ?? 9999);
    const bv = Number(b?.[field] ?? 9999);
    if (av !== bv) return av - bv;
    return String(a?.name || a?.title || a?.code || '').localeCompare(String(b?.name || b?.title || b?.code || ''), 'ko');
  });
}

function defaultThemeSettings() {
  return {
    id: 1,
    primary_color: '#2563eb',
    secondary_color: '#0f172a',
    accent_color: '#f59e0b',
    background_color: '#ffffff',
    text_color: '#111827',
    header_bg_color: '#ffffff',
    calendar_bg_color: '#ffffff',
    event_list_bg_color: '#ffffff',
    event_list_outer_bg_color: '#f8fafc',
    page_bg_color: '#f8fafc',
    created_at: null,
    updated_at: null,
  };
}

function defaultBillboardSettings() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: 1,
    enabled: true,
    auto_slide_interval: 5000,
    inactivity_timeout: 300000,
    auto_open_on_load: true,
    transition_duration: 300,
    date_range_start: today,
    date_range_end: null,
    show_date_range: true,
    play_order: 'random',
    excluded_weekdays: [],
    excluded_event_ids: [],
    default_thumbnail_class: null,
    default_thumbnail_event: null,
  };
}

async function getBoardStaticData() {
  const [
    categories,
    prefixes,
    themeSettings,
    billboardSettings,
    practiceRooms,
    venues,
    shops,
    appSettings,
  ] = await Promise.all([
    loadRows('board_categories'),
    loadRows('board_prefixes'),
    loadRows('theme_settings'),
    loadRows('billboard_settings'),
    loadRows('practice_rooms'),
    loadRows('venues'),
    loadRows('shops'),
    loadRows('app_settings'),
  ]);

  const groupedPrefixes = {};
  for (const prefix of sortRows(prefixes).filter((row) => row.is_active !== false)) {
    const key = prefix.board_category_code || prefix.category_code || prefix.category || 'default';
    groupedPrefixes[key] = groupedPrefixes[key] || [];
    groupedPrefixes[key].push(prefix);
  }

  const genreWeightsRow = appSettings.find((row) => row.key === 'genre_weights');
  const practiceRows = practiceRooms.length ? practiceRooms : venues;

  return {
    categories: sortRows(categories).filter((row) => row.is_active !== false),
    prefixes: groupedPrefixes,
    theme_settings: themeSettings[0] || defaultThemeSettings(),
    billboard_settings: billboardSettings[0] || defaultBillboardSettings(),
    practice_rooms: sortRows(practiceRows).filter((row) => row.is_active !== false),
    shops: sortRows(shops).filter((row) => row.is_active !== false),
    genre_weights: genreWeightsRow?.value || {},
  };
}

function actorMatches(row, userId) {
  if (!userId) return false;
  return [row?.user_id, row?.fingerprint, row?.session_id, row?.viewer_key]
    .filter((value) => value !== undefined && value !== null)
    .some((value) => String(value) === String(userId) || String(value) === `user:${String(userId)}`);
}

function interactionIds(rows, userId, idField, numeric = false) {
  return rows
    .filter((row) => actorMatches(row, userId))
    .map((row) => row?.[idField])
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => (numeric ? Number(value) : String(value)))
    .filter((value) => (numeric ? Number.isFinite(value) : Boolean(value)));
}

async function getUserInteractions(userId) {
  if (!userId) {
    return {
      post_likes: [],
      post_dislikes: [],
      post_favorites: [],
      anonymous_post_likes: [],
      anonymous_post_dislikes: [],
      comment_likes: [],
      comment_dislikes: [],
      anonymous_comment_likes: [],
      anonymous_comment_dislikes: [],
      event_favorites: [],
      social_group_favorites: [],
      practice_room_favorites: [],
      shop_favorites: [],
    };
  }

  const [
    postLikes,
    postDislikes,
    postFavorites,
    anonymousPostLikes,
    anonymousPostDislikes,
    commentLikes,
    commentDislikes,
    anonymousCommentLikes,
    anonymousCommentDislikes,
    eventFavorites,
    socialGroupFavorites,
    practiceRoomFavorites,
    shopFavorites,
  ] = await Promise.all([
    loadRows('board_post_likes'),
    loadRows('board_post_dislikes'),
    loadRows('board_post_favorites'),
    loadRows('board_anonymous_likes'),
    loadRows('board_anonymous_dislikes'),
    loadRows('board_comment_likes'),
    loadRows('board_comment_dislikes'),
    loadRows('board_anonymous_comment_likes'),
    loadRows('board_anonymous_comment_dislikes'),
    loadRows('event_favorites'),
    loadRows('social_group_favorites'),
    loadRows('practice_room_favorites'),
    loadRows('shop_favorites'),
  ]);

  return {
    post_likes: interactionIds(postLikes, userId, 'post_id', false),
    post_dislikes: interactionIds(postDislikes, userId, 'post_id', false),
    post_favorites: interactionIds(postFavorites, userId, 'post_id', false),
    anonymous_post_likes: interactionIds(anonymousPostLikes, userId, 'post_id', true),
    anonymous_post_dislikes: interactionIds(anonymousPostDislikes, userId, 'post_id', true),
    comment_likes: interactionIds(commentLikes, userId, 'comment_id', false),
    comment_dislikes: interactionIds(commentDislikes, userId, 'comment_id', false),
    anonymous_comment_likes: interactionIds(anonymousCommentLikes, userId, 'comment_id', true),
    anonymous_comment_dislikes: interactionIds(anonymousCommentDislikes, userId, 'comment_id', true),
    event_favorites: interactionIds(eventFavorites, userId, 'event_id', false),
    social_group_favorites: interactionIds(socialGroupFavorites, userId, 'group_id', false),
    practice_room_favorites: interactionIds(practiceRoomFavorites, userId, 'practice_room_id', false),
    shop_favorites: interactionIds(shopFavorites, userId, 'shop_id', false),
  };
}

function viewTargetTable(itemType) {
  if (itemType === 'board_post') return 'board_posts';
  if (itemType === 'event') return 'events';
  if (itemType === 'schedule' || itemType === 'social_schedule') return 'social_schedules';
  return null;
}

async function incrementItemViews(args = {}) {
  const itemId = args.p_item_id ?? args.item_id;
  const itemType = args.p_item_type ?? args.item_type;
  const viewerKey = args.p_user_id
    ? `user:${args.p_user_id}`
    : args.p_fingerprint
      ? `fingerprint:${args.p_fingerprint}`
      : null;
  const targetTable = viewTargetTable(itemType);

  if (!itemId || !itemType || !viewerKey || !targetTable) return false;

  const existing = (await loadRows('item_views')).find((row) => (
    String(row.item_id) === String(itemId) &&
    String(row.item_type) === String(itemType) &&
    String(row.viewer_key) === String(viewerKey)
  ));
  if (existing) return false;

  const now = new Date().toISOString();
  await saveRow('item_views', {
    id: crypto.randomUUID(),
    item_id: itemId,
    item_type: itemType,
    viewer_key: viewerKey,
    user_id: args.p_user_id || null,
    fingerprint: args.p_fingerprint || null,
    created_at: now,
  });

  const rows = await loadRows(targetTable);
  const target = rows.find((row) => String(row.id) === String(itemId));
  if (target) {
    await saveRow(targetTable, {
      ...target,
      views: (Number(target.views) || 0) + 1,
      updated_at: target.updated_at === undefined ? undefined : now,
    });
  }

  return true;
}

async function handlePushSubscription(args = {}, user = null) {
  if (!user?.id) {
    const error = new Error('로그인이 필요합니다.');
    error.statusCode = 401;
    throw error;
  }

  const endpoint = args.p_endpoint || args.endpoint;
  if (!endpoint) {
    const error = new Error('endpoint is required');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const existing = (await loadRows('user_push_subscriptions')).find((row) => String(row.endpoint) === String(endpoint));
  await saveRow('user_push_subscriptions', {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    endpoint,
    subscription: args.p_subscription || args.subscription || null,
    user_id: user.id,
    user_agent: args.p_user_agent || args.user_agent || null,
    is_admin: Boolean(args.p_is_admin ?? args.is_admin ?? user.is_admin),
    pref_events: args.p_pref_events ?? true,
    pref_class: args.p_pref_class ?? true,
    pref_clubs: args.p_pref_clubs ?? true,
    pref_filter_tags: args.p_pref_filter_tags ?? null,
    pref_filter_class_genres: args.p_pref_filter_class_genres ?? null,
    created_at: existing?.created_at || now,
    updated_at: now,
  }, ['endpoint']);

  return true;
}

function findActorInteraction(rows, itemField, itemId, userId, fingerprint = null) {
  return rows.find((row) => (
    String(row?.[itemField]) === String(itemId) &&
    (
      (userId && String(row?.user_id || '') === String(userId)) ||
      (userId && String(row?.fingerprint || '') === String(userId)) ||
      (fingerprint && String(row?.fingerprint || '') === String(fingerprint))
    )
  )) || null;
}

async function togglePairedInteraction({
  itemId,
  userId,
  fingerprint,
  type,
  likeTable,
  dislikeTable,
  itemField,
}) {
  if (!itemId || (!userId && !fingerprint)) {
    return { status: 'error', message: '로그인이 필요합니다.' };
  }

  const now = new Date().toISOString();
  const activeTable = type === 'dislike' ? dislikeTable : likeTable;
  const oppositeTable = type === 'dislike' ? likeTable : dislikeTable;
  const activeRows = await loadRows(activeTable);
  const oppositeRows = await loadRows(oppositeTable);
  const active = findActorInteraction(activeRows, itemField, itemId, userId, fingerprint);
  const opposite = findActorInteraction(oppositeRows, itemField, itemId, userId, fingerprint);

  if (active) {
    await deleteRows(activeTable, [active]);
    await recomputeCountSideEffects(activeTable, [active]);
    return { status: type === 'dislike' ? 'undisliked' : 'unliked' };
  }

  if (opposite) {
    await deleteRows(oppositeTable, [opposite]);
    await recomputeCountSideEffects(oppositeTable, [opposite]);
  }

  const row = {
    id: crypto.randomUUID(),
    [itemField]: itemId,
    user_id: userId || null,
    fingerprint: fingerprint || userId || null,
    created_at: now,
  };
  await saveRow(activeTable, row);
  await recomputeCountSideEffects(activeTable, [row]);

  return { status: type === 'dislike' ? 'disliked' : 'liked' };
}

async function toggleAnonymousInteraction(args = {}, user = null) {
  return togglePairedInteraction({
    itemId: args.p_post_id || args.post_id,
    userId: args.p_user_id || args.user_id || user?.id,
    fingerprint: args.p_fingerprint || args.fingerprint || null,
    type: args.p_type || args.type || 'like',
    likeTable: 'board_anonymous_likes',
    dislikeTable: 'board_anonymous_dislikes',
    itemField: 'post_id',
  });
}

async function toggleCommentInteraction(args = {}, user = null) {
  const isAnonymous = Boolean(args.p_is_anonymous ?? args.is_anonymous);
  const userId = user?.id || args.p_user_id || args.user_id;
  const fingerprint = args.p_fingerprint || args.fingerprint || (isAnonymous ? userId : null);
  return togglePairedInteraction({
    itemId: args.p_comment_id || args.comment_id,
    userId: isAnonymous ? null : userId,
    fingerprint,
    type: args.p_type || args.type || 'like',
    likeTable: isAnonymous ? 'board_anonymous_comment_likes' : 'board_comment_likes',
    dislikeTable: isAnonymous ? 'board_anonymous_comment_dislikes' : 'board_comment_dislikes',
    itemField: 'comment_id',
  });
}

async function deletePostWithPassword(args = {}, user = null) {
  const id = args.p_post_id || args.post_id;
  const password = args.p_password || args.password;
  const targets = applyFilters(await loadRows('board_posts'), [{ field: 'id', op: 'eq', value: id }], []);
  const target = targets[0];
  const ok = Boolean(target && (
    user?.is_admin ||
    userMatchesId(user, target.user_id) ||
    (target.password && String(target.password) === String(password))
  ));
  if (ok) {
    await deleteRows('board_posts', targets);
  }
  return ok;
}

function classifyAnalyticsContent(row = {}) {
  const text = `${row.target_type || ''} ${row.category || ''} ${row.target_title || ''} ${row.section || ''}`.toLowerCase();
  if (text.includes('class') || text.includes('강습') || text.includes('모집')) return 'class';
  return 'event';
}

function eventLeadDays(event = {}) {
  const start = event.start_date || event.date;
  const created = event.created_at;
  if (!start || !created) return null;
  const startMs = new Date(`${String(start).slice(0, 10)}T00:00:00+09:00`).getTime();
  const createdMs = new Date(created).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(createdMs)) return null;
  return Math.floor((startMs - createdMs) / (24 * 60 * 60 * 1000));
}

async function getMonthlyWebzineStats(args = {}) {
  const { startMs, endMs } = analyticsDateRange({
    start: args.p_start_date || args.start_date || args.start,
    end: args.p_end_date || args.end_date || args.end,
  });
  const sessions = (await loadRows('session_logs'))
    .map((row, index) => ({ row, index, ms: analyticsMs(row.session_start || row.created_at) }))
    .filter(({ row, ms }) => ms !== null && ms >= startMs && ms <= endMs && !asAnalyticsBool(row.is_admin));
  const logs = (await loadRows('site_analytics_logs'))
    .map((row, index) => ({ row, index, ms: analyticsMs(row.created_at) }))
    .filter(({ row, ms }) => ms !== null && ms >= startMs && ms <= endMs && !asAnalyticsBool(row.is_admin));

  const identity = buildAnalyticsIdentityResolver([
    ...sessions.map((item) => item.row),
    ...logs.map((item) => item.row),
  ]);
  const uniqueVisitors = new Set(logs.map((item) => analyticsIdentifier(item.row, item.index, identity))).size;
  const dailyMap = new Map();
  const hourlyMap = new Map(Array.from({ length: 24 }, (_, hour) => [hour, { hour, class_count: 0, event_count: 0 }]));
  const topMap = new Map();

  for (const item of logs) {
    const date = new Date(item.ms);
    const day = date.getDay();
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);

    const hour = date.getHours();
    const hourly = hourlyMap.get(hour) || { hour, class_count: 0, event_count: 0 };
    if (classifyAnalyticsContent(item.row) === 'class') hourly.class_count += 1;
    else hourly.event_count += 1;
    hourlyMap.set(hour, hourly);

    const topKey = `${item.row.target_type || 'content'}:${item.row.target_id || item.row.route || item.index}`;
    const top = topMap.get(topKey) || {
      id: String(item.row.target_id || item.row.route || item.index),
      title: item.row.target_title || item.row.route || item.row.page_url || 'Untitled',
      type: item.row.target_type || 'content',
      count: 0,
    };
    top.count += 1;
    topMap.set(topKey, top);
  }

  const events = await loadRows('events');
  const leadTime = { classD28: 0, classD7: 0, eventD42: 0, eventD14: 0 };
  for (const event of events) {
    const leadDays = eventLeadDays(event);
    if (leadDays === null) continue;
    const category = classifyAnalyticsContent({ target_type: event.category, target_title: event.title });
    if (category === 'class') {
      if (leadDays >= 28) leadTime.classD28 += 1;
      if (leadDays <= 7) leadTime.classD7 += 1;
    } else {
      if (leadDays >= 42) leadTime.eventD42 += 1;
      if (leadDays <= 14) leadTime.eventD14 += 1;
    }
  }

  return {
    meta: {
      uniqueVisitors,
      totalLogs: logs.length,
    },
    dailyTraffic: Array.from({ length: 7 }, (_, day) => ({ day, count: dailyMap.get(day) || 0 })),
    hourlyStats: Array.from(hourlyMap.values()).sort((a, b) => a.hour - b.hour),
    leadTime,
    topContents: Array.from(topMap.values()).sort((a, b) => b.count - a.count).slice(0, 12),
  };
}

async function incrementWebzineView(args = {}) {
  const id = args.row_id || args.id;
  if (!id) return false;
  const rows = await loadRows('webzine_posts');
  const target = rows.find((row) => String(row.id) === String(id));
  if (!target) return false;
  await saveRow('webzine_posts', {
    ...target,
    views: (Number(target.views) || 0) + 1,
    updated_at: target.updated_at === undefined ? undefined : new Date().toISOString(),
  });
  return true;
}

export async function queryRecords(req, res) {
  const table = req.params.table;
  await requireGenericAccess(req, table, 'query', req.body || {});
  const body = req.body || {};
  const user = table === 'events' ? await getCurrentUser(req) : null;
  const rows = await loadRows(table);
  let data = applyFilters(rows, body.filters || [], body.orFilters || []);
  const count = data.length;
  data = applyOrders(data, body.orders || []);
  data = applyRange(data, body.range, body.limit);
  data = await hydrateRows(table, data, body.select || '');
  if (table === 'events') {
    data = sanitizeEventsForViewer(await attachEventAuthors(data), user);
  }

  if (body.head) {
    res.json(responsePayload({ data: null, count }));
    return;
  }

  if (body.single || body.maybeSingle) {
    res.json(responsePayload({ data: data[0] || null, count }));
    return;
  }

  res.json(responsePayload({ data, count }));
}

export async function insertRecords(req, res) {
  const table = req.params.table;
  await requireGenericAccess(req, table, 'insert', req.body || {});
  const user = table === 'events'
    ? await requireEventWriter(req)
    : table === 'board_users'
      ? await getCurrentUser(req)
      : null;
  const rawValues = getBodyValues(req.body);
  const values = table === 'events'
    ? normalizeEventInsertValues(rawValues, user)
    : table === 'board_users' && user && !user.is_admin
      ? rawValues.map((value) => normalizeBoardUserSelfValue(value, user))
      : rawValues;
  const conflictKeys = resolveConflictKeys(req.body?.options);
  if (table === 'events') {
    const existingRows = await loadRows(table);
    for (const value of values) {
      const existing = value?.id
        ? existingRows.find((row) => String(row?.id) === String(value.id))
        : null;
      if (existing && !canManageEvent(user, existing)) {
        throw httpError('수정 권한이 없습니다.', 403);
      }
    }
  }
  const data = [];
  for (const value of values) data.push(await saveRow(table, value, conflictKeys));
  await recomputeCountSideEffects(table, data);
  const responseData = await eventMutationResponseData(table, data, user, req.body?.select || '');
  res.status(201).json(responsePayload({ data: req.body?.single || req.body?.maybeSingle ? responseData[0] || null : responseData, status: 201 }));
}

export async function updateRecords(req, res) {
  const table = req.params.table;
  await requireGenericAccess(req, table, 'update', req.body || {});
  const user = table === 'events' || table === 'board_users' ? await getCurrentUser(req) : null;
  const updates = table === 'events' && user
    ? normalizeEventUpdateValues(req.body?.values || {}, user)
    : table === 'board_users' && user && !user.is_admin
      ? normalizeBoardUserSelfValue(req.body?.values || {}, user)
    : req.body?.values || {};
  const targets = await resolveMutationTargets(table, req.body?.filters || [], req.body?.orFilters || []);
  const data = [];
  for (const row of targets) data.push(await saveRow(table, { ...row, ...updates }));
  await recomputeCountSideEffects(table, [...targets, ...data]);
  const responseData = await eventMutationResponseData(table, data, user, req.body?.select || '');
  res.json(responsePayload({ data: req.body?.single || req.body?.maybeSingle ? responseData[0] || null : responseData, count: data.length }));
}

export async function upsertRecords(req, res) {
  const table = req.params.table;
  await requireGenericAccess(req, table, 'upsert', req.body || {});
  const user = table === 'events'
    ? await requireEventWriter(req)
    : table === 'board_users'
      ? await getCurrentUser(req)
      : null;
  const values = getBodyValues(req.body);
  const conflictKeys = resolveConflictKeys(req.body?.options);
  const mutationConflictKeys = table === 'events' && !conflictKeys.length ? ['id'] : conflictKeys;
  const existingRows = await loadRows(table);
  const data = [];

  for (const value of values) {
    let existing = null;
    let next = value;
    if (mutationConflictKeys.length) {
      existing = existingRows.find((row) => mutationConflictKeys.every((key) => (
        value?.[key] !== undefined &&
        value?.[key] !== null &&
        String(row?.[key]) === String(value?.[key])
      ))) || null;
      if (table === 'events' && existing && !canManageEvent(user, existing)) {
        throw httpError('수정 권한이 없습니다.', 403);
      }
      if (table === 'board_users' && user && !user.is_admin && existing && !isOwnBoardUserRow(user, existing)) {
        throw httpError('수정 권한이 없습니다.', 403);
      }
      if (existing) next = { ...existing, ...value };
    }
    if (table === 'events') {
      next = normalizeEventUpsertValue(value, existing, user);
    } else if (table === 'board_users' && user && !user.is_admin) {
      next = normalizeBoardUserSelfValue(value, user, existing || {});
    }
    data.push(await saveRow(table, next, conflictKeys));
  }

  await recomputeCountSideEffects(table, data);
  const responseData = await eventMutationResponseData(table, data, user, req.body?.select || '');
  res.json(responsePayload({ data: req.body?.single || req.body?.maybeSingle ? responseData[0] || null : responseData }));
}

export async function deleteRecords(req, res) {
  const table = req.params.table;
  await requireGenericAccess(req, table, 'delete', req.body || {});
  const user = table === 'events' ? await getCurrentUser(req) : null;
  const targets = await resolveMutationTargets(table, req.body?.filters || [], req.body?.orFilters || []);
  await deleteRows(table, targets);
  await recomputeCountSideEffects(table, targets);
  const responseData = table === 'events'
    ? sanitizeEventsForViewer(await attachEventAuthors(targets), user)
    : targets;
  res.json(responsePayload({ data: responseData, count: targets.length }));
}

export async function callRpc(req, res) {
  const name = req.params.name;
  const args = req.body?.args || {};
  const user = await getCurrentUser(req);

  if (adminOnlyRpcNames.has(name)) {
    await requireAdmin(req);
  }

  if (name === 'get_user_admin_status') {
    res.json(responsePayload({ data: Boolean(user?.is_admin) }));
    return;
  }

  if (name === 'get_board_static_data') {
    res.json(responsePayload({ data: await getBoardStaticData() }));
    return;
  }

  if (name === 'get_user_interactions') {
    res.json(responsePayload({ data: await getUserInteractions(args.p_user_id || args.user_id || user?.id) }));
    return;
  }

  if (name === 'create_usage_snapshot') {
    await createUsageSnapshot(args);
    res.json(responsePayload({ data: true }));
    return;
  }

  if (name === 'refresh_site_stats_index' || name === 'refresh_site_metrics') {
    res.json(responsePayload({ data: true }));
    return;
  }

  if (name === 'handle_user_withdrawal') {
    const userId = args.p_user_id || args.user_id || user?.id;
    if (userId) {
      const targets = applyFilters(await loadRows('board_users'), [{ field: 'user_id', op: 'eq', value: userId }], []);
      for (const row of targets) await saveRow('board_users', { ...row, status: 'deleted', nickname: '탈퇴한 사용자', deleted_at: new Date().toISOString() });
    }
    res.json(responsePayload({ data: true }));
    return;
  }

  if (name === 'delete_anonymous_post_with_password') {
    const id = args.p_post_id || args.post_id;
    const password = args.p_password || args.password;
    const targets = applyFilters(await loadRows('board_anonymous_posts'), [{ field: 'id', op: 'eq', value: id }], []);
    const ok = targets[0] && (user?.is_admin || !targets[0].password || targets[0].password === password);
    if (ok) await deleteRows('board_anonymous_posts', targets);
    if (ok) await recomputeCountSideEffects('board_anonymous_comments', targets);
    res.json(responsePayload({ data: Boolean(ok) }));
    return;
  }

  if (name === 'delete_post_with_password') {
    res.json(responsePayload({ data: await deletePostWithPassword(args, user) }));
    return;
  }

  if (name === 'update_anonymous_post_with_password') {
    const id = args.p_post_id || args.post_id;
    const password = args.p_password || args.password;
    const targets = applyFilters(await loadRows('board_anonymous_posts'), [{ field: 'id', op: 'eq', value: id }], []);
    const ok = targets[0] && (!targets[0].password || targets[0].password === password);
    if (ok) await saveRow('board_anonymous_posts', { ...targets[0], ...(args.p_updates || args.updates || {}) });
    res.json(responsePayload({ data: Boolean(ok) }));
    return;
  }

  if (name === 'delete_anonymous_comment_with_password') {
    const id = args.p_comment_id || args.comment_id;
    const password = args.p_password || args.password;
    const table = args.p_table || 'board_anonymous_comments';
    const targets = applyFilters(await loadRows(table), [{ field: 'id', op: 'eq', value: id }], []);
    const ok = targets[0] && (!targets[0].password || targets[0].password === password);
    if (ok) await deleteRows(table, targets);
    if (ok) await recomputeCountSideEffects(table, targets);
    res.json(responsePayload({ data: Boolean(ok) }));
    return;
  }

  if (name === 'update_anonymous_comment_with_password') {
    const id = args.p_comment_id || args.comment_id;
    const password = args.p_password || args.password;
    const table = args.p_table || 'board_anonymous_comments';
    const targets = applyFilters(await loadRows(table), [{ field: 'id', op: 'eq', value: id }], []);
    const ok = targets[0] && (!targets[0].password || targets[0].password === password);
    if (ok) await saveRow(table, { ...targets[0], ...(args.p_updates || args.updates || {}) });
    res.json(responsePayload({ data: Boolean(ok) }));
    return;
  }

  if (name === 'create_board_post') {
    const row = await saveRow('board_posts', { ...args, id: args.id || crypto.randomUUID(), user_id: args.user_id || user?.id || null });
    res.json(responsePayload({ data: row }));
    return;
  }

  if (name === 'update_board_post') {
    const id = args.p_post_id || args.post_id || args.id;
    const targets = applyFilters(await loadRows('board_posts'), [{ field: 'id', op: 'eq', value: id }], []);
    const row = targets[0] ? await saveRow('board_posts', { ...targets[0], ...(args.p_updates || args.updates || args) }) : null;
    res.json(responsePayload({ data: row }));
    return;
  }

  if (name === 'increment_item_views') {
    res.json(responsePayload({ data: await incrementItemViews(args) }));
    return;
  }

  if (name === 'handle_push_subscription') {
    res.json(responsePayload({ data: await handlePushSubscription(args, user) }));
    return;
  }

  if (name === 'toggle_anonymous_interaction') {
    res.json(responsePayload({ data: await toggleAnonymousInteraction(args, user) }));
    return;
  }

  if (name === 'toggle_comment_interaction') {
    res.json(responsePayload({ data: await toggleCommentInteraction(args, user) }));
    return;
  }

  if (name === 'get_monthly_webzine_stats') {
    res.json(responsePayload({ data: await getMonthlyWebzineStats(args) }));
    return;
  }

  if (name === 'increment_webzine_view') {
    res.json(responsePayload({ data: await incrementWebzineView(args) }));
    return;
  }

  if (name === 'get_analytics_summary_v2') {
    res.json(responsePayload({ data: await getAnalyticsSummaryV2(args) }));
    return;
  }

  res.json(responsePayload({ data: null }));
}

export async function uploadGenericFile(req, res) {
  const { bucket = 'images', filePath, dataBase64, mimeType } = req.body || {};
  if (!filePath || !dataBase64) {
    res.status(400).json({ error: 'filePath and dataBase64 are required' });
    return;
  }

  assertTableName(bucket);
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const safePath = String(filePath).replace(/^\/+/, '').replace(/\.\.+/g, '');
  const targetPath = path.join(uploadRoot, bucket, safePath);
  const buffer = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  const maxBytes = Number(process.env.CAFE24_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);

  if (!buffer.length || buffer.length > maxBytes) {
    res.status(400).json({ error: 'Invalid file size' });
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);

  res.json({
    data: {
      path: safePath,
      fullPath: `${bucket}/${safePath}`,
      publicUrl: `/uploads/${bucket}/${safePath}`,
      mimeType,
    },
    error: null,
  });
}

export async function listGenericFiles(req, res) {
  const bucket = req.params.bucket;
  assertTableName(bucket);
  const prefix = String(req.query.prefix || '').replace(/^\/+/, '').replace(/\.\.+/g, '');
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const targetDir = path.join(uploadRoot, bucket, prefix);

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    res.json({
      data: entries.map((entry) => ({
        name: entry.name,
        id: entry.name,
        updated_at: null,
        created_at: null,
        metadata: { isDirectory: entry.isDirectory() },
      })),
      error: null,
    });
  } catch {
    res.json({ data: [], error: null });
  }
}

export async function removeGenericFiles(req, res) {
  const bucket = req.params.bucket;
  assertTableName(bucket);
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const removed = [];

  for (const item of paths) {
    const safePath = String(item).replace(/^\/+/, '').replace(/\.\.+/g, '');
    try {
      await fs.rm(path.join(uploadRoot, bucket, safePath), { force: true, recursive: true });
      removed.push(safePath);
    } catch {
      // Ignore missing files.
    }
  }

  res.json({ data: removed, error: null });
}

export {
  applyFilters as applyCafe24Filters,
  deleteRows as deleteCafe24TableRows,
  loadRows as loadCafe24TableRows,
  saveRow as saveCafe24TableRow,
};
