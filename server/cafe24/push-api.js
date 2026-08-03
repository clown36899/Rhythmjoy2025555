import webpush from 'web-push';
import crypto from 'node:crypto';
import { getCurrentUser, requireAdmin } from './auth-api.js';
import { getMysqlPool } from './mysql-pool.js';
import {
  deleteCafe24TableRows,
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';
import {
  getUserNotificationPreferences,
  loadEnabledNotificationPreferences,
  normalizeNotificationPreferences,
  saveUserNotificationPreferences,
} from './notification-preferences.js';

const DEFAULT_PUBLIC_VAPID_KEY = 'BGI9DEEYcY0HtnDAA6Ae7HJb7bEh5XGSkV3dH7QYzpA5fjyDoVMuwTGQoPa0mcSrIRMyycYStDaaa1nqtwt9Ih0';
const DEFAULT_DAILY_DIGEST_TIME = '08:30';
const STALE_PUSH_STATUS_CODES = new Set([404, 410]);
const PUSH_SEND_TIMEOUT_MS = Math.max(1000, Number(process.env.PUSH_SEND_TIMEOUT_MS || 8000));
const NOTIFICATION_QUEUE_MAX_AGE_MS = Math.max(
  60_000,
  Number(process.env.NOTIFICATION_QUEUE_MAX_AGE_MS || 24 * 60 * 60 * 1000),
);
const NOTIFICATION_QUEUE_MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_QUEUE_MAX_ATTEMPTS || 5));
const NOTIFICATION_QUEUE_PUSH_BURST_LIMIT = Math.max(
  1,
  Number(process.env.NOTIFICATION_QUEUE_PUSH_BURST_LIMIT || 3),
);
const VAPID_MISMATCH_RE = /vapid credentials.*do not correspond/i;
let notificationQueueRun = null;

function httpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseJsonValue(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function asBool(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function kstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    timeKey: `${parts.hour}:${parts.minute}`,
    day: weekdayMap[parts.weekday] ?? date.getDay(),
  };
}

function normalizeDateKey(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function eventDateKeys(event = {}) {
  const keys = new Set();
  const explicitDates = Array.isArray(event.event_dates)
    ? event.event_dates
    : parseJsonValue(event.event_dates, []);
  if (Array.isArray(explicitDates)) {
    explicitDates.forEach((date) => {
      const key = normalizeDateKey(date);
      if (key) keys.add(key);
    });
  }

  [event.start_date, event.date, event.date_value].forEach((date) => {
    const key = normalizeDateKey(date);
    if (key) keys.add(key);
  });

  return keys;
}

function eventOccursOnDate(event, dateKey) {
  const keys = eventDateKeys(event);
  if (keys.has(dateKey)) return true;

  const start = normalizeDateKey(event.start_date || event.date || event.date_value);
  const end = normalizeDateKey(event.end_date);
  if (start && end) return start <= dateKey && dateKey <= end;

  return false;
}

function eventLastDateKey(event = {}) {
  const explicitDates = Array.isArray(event.event_dates)
    ? event.event_dates
    : parseJsonValue(event.event_dates, []);
  const candidates = [
    event.end_date,
    ...(Array.isArray(explicitDates) ? explicitDates : []),
    event.start_date,
    event.date,
    event.date_value,
  ].map(normalizeDateKey).filter(Boolean).sort();
  return candidates.at(-1) || null;
}

function eventMatchesDigestPrefs(event, prefs = {}) {
  const category = String(event.category || event.activity_type || '').toLowerCase();
  if ((category === 'class' || category === 'regular') && !asBool(prefs.pref_class ?? true)) return false;
  if (category === 'club' && !asBool(prefs.pref_clubs ?? true)) return false;
  if (!['class', 'regular', 'club'].includes(category) && !asBool(prefs.pref_events ?? true)) return false;

  if (category === 'class' || category === 'regular') {
    const selectedGenres = Array.isArray(prefs.pref_filter_class_genres)
      ? prefs.pref_filter_class_genres.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (selectedGenres.length > 0) {
      const genre = String(event.genre || event.dance_genre || event.event_type || '기타').trim() || '기타';
      if (!selectedGenres.some((selected) => genre.includes(selected) || selected.includes(genre))) return false;
    }
  } else if (category !== 'club') {
    const selectedTags = Array.isArray(prefs.pref_filter_tags)
      ? prefs.pref_filter_tags.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (selectedTags.length > 0) {
      const rawTags = Array.isArray(event.tags) ? event.tags : parseJsonValue(event.tags, []);
      const tags = Array.isArray(rawTags) ? rawTags.map((value) => String(value).trim()).filter(Boolean) : [];
      const fallbackTag = category === 'social' ? '파티' : '기타';
      const comparableTags = tags.length > 0 ? tags : [fallbackTag];
      if (!selectedTags.some((selected) => comparableTags.some((tag) => tag.includes(selected) || selected.includes(tag)))) return false;
    }
  }
  return true;
}

function eventMatchesNewEventPrefs(event, prefs = {}) {
  const category = String(event.category || event.activity_type || '').toLowerCase();
  if (category === 'social') return asBool(prefs.pref_new_event_social ?? true);
  if (category === 'class' || category === 'regular') return asBool(prefs.pref_new_event_class ?? true);
  if (category === 'club') return asBool(prefs.pref_new_event_clubs ?? true);
  return asBool(prefs.pref_new_event_social ?? true);
}

function getStoredPreferences(row = {}) {
  const subscription = parseJsonValue(row.subscription, row.subscription || {});
  const stored = subscription?.preferences && typeof subscription.preferences === 'object'
    ? subscription.preferences
    : {};
  return {
    pref_today_digest: row.pref_today_digest ?? stored.pref_today_digest ?? true,
    pref_new_event_alerts: row.pref_new_event_alerts ?? stored.pref_new_event_alerts ?? false,
    pref_events: row.pref_events ?? stored.pref_events ?? true,
    pref_class: row.pref_class ?? stored.pref_class ?? true,
    pref_clubs: row.pref_clubs ?? stored.pref_clubs ?? true,
    pref_new_event_social: row.pref_new_event_social ?? stored.pref_new_event_social ?? true,
    pref_new_event_class: row.pref_new_event_class ?? stored.pref_new_event_class ?? true,
    pref_new_event_clubs: row.pref_new_event_clubs ?? stored.pref_new_event_clubs ?? true,
    pref_digest_time: row.pref_digest_time ?? stored.pref_digest_time ?? DEFAULT_DAILY_DIGEST_TIME,
    pref_digest_days: Array.isArray(row.pref_digest_days)
      ? row.pref_digest_days
      : Array.isArray(stored.pref_digest_days)
        ? stored.pref_digest_days
        : [0, 1, 2, 3, 4, 5, 6],
    pref_only_with_events: row.pref_only_with_events ?? stored.pref_only_with_events ?? true,
  };
}

function getSubscriptionPayload(row = {}) {
  const subscription = parseJsonValue(row.subscription, row.subscription || {});
  if (!subscription?.endpoint) return null;
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) return null;
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

function endpointMeta(endpoint = '') {
  try {
    const url = new URL(endpoint);
    return { endpointHost: url.host, endpointLength: endpoint.length };
  } catch {
    return { endpointHost: 'unknown', endpointLength: String(endpoint || '').length };
  }
}

function isStalePushError(statusCode, message) {
  if (STALE_PUSH_STATUS_CODES.has(statusCode)) return true;
  return statusCode === 403 && VAPID_MISMATCH_RE.test(String(message || ''));
}

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_PUBLIC_VAPID_KEY || DEFAULT_PUBLIC_VAPID_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@swingenjoy.com';

  if (!privateKey) {
    throw httpError('VAPID_PRIVATE_KEY is missing. Push can be saved, but the server cannot send notifications.', 503);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, subject };
}

async function loadAdminUserIds() {
  const pool = getMysqlPool();
  const [adminUsers] = await pool.execute('SELECT id FROM users WHERE is_admin = 1');
  return new Set(adminUsers.map((row) => String(row.id)));
}

async function loadAdminSubscriptions() {
  const [rows, adminUserIds] = await Promise.all([
    loadPushSubscriptions(),
    loadAdminUserIds(),
  ]);
  return rows.filter((row) => asBool(row.is_admin) || adminUserIds.has(String(row.user_id || '')));
}

async function loadPushSubscriptions() {
  return await loadCafe24TableRows('user_push_subscriptions');
}

async function loadNotificationInboxRecipients() {
  const pool = getMysqlPool();
  const [rows] = await pool.execute(
    `SELECT u.id AS user_id,
            MAX(COALESCE(s.last_seen_at, s.created_at, u.created_at)) AS last_seen_at
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id
      GROUP BY u.id`,
  );
  return rows
    .map((row) => ({
      user_id: String(row.user_id || row.id || ''),
      last_seen_at: row.last_seen_at || null,
    }))
    .filter((row) => row.user_id);
}

function latestStoredPreferencesForUser(rows, userId) {
  const matches = rows
    .filter((row) => String(row.user_id || '') === String(userId))
    .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
  return matches[0] ? normalizeNotificationPreferences({ enabled: true, ...getStoredPreferences(matches[0]) }) : null;
}

export async function getNotificationPreferences(req, res) {
  const user = await getCurrentUser(req);
  if (!user?.id) throw httpError('로그인이 필요합니다.', 401);
  const saved = await getUserNotificationPreferences(user.id);
  const fallback = saved || latestStoredPreferencesForUser(await loadPushSubscriptions(), user.id);
  res.json({ preferences: fallback || normalizeNotificationPreferences({ enabled: false }) });
}

export async function updateNotificationPreferences(req, res) {
  const user = await getCurrentUser(req);
  if (!user?.id) throw httpError('로그인이 필요합니다.', 401);
  const preferences = await saveUserNotificationPreferences(user.id, req.body || {});
  res.json({ preferences });
}

function uniqueNotificationUsers(rows = []) {
  const byUserId = new Map();
  for (const row of rows) {
    const userId = String(row?.user_id || '').trim();
    if (userId && !byUserId.has(userId)) byUserId.set(userId, row);
  }
  return [...byUserId.values()];
}

async function saveInboxNotifications(rows, {
  title,
  body,
  url = '/',
  kind,
  sourceId,
  data = {},
}) {
  const recipients = uniqueNotificationUsers(rows);
  if (recipients.length === 0) return { targets: 0, saved: 0 };

  const pool = getMysqlPool();
  let saved = 0;
  for (const row of recipients) {
    const [result] = await pool.execute(
      `INSERT IGNORE INTO user_notifications
         (user_id, title, body, url, kind, source_id, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(row.user_id),
        title || '댄스빌보드 알림',
        body || '',
        url || '/',
        kind,
        String(sourceId),
        JSON.stringify(data || {}),
      ],
    );
    saved += Number(result?.affectedRows || 0);
  }
  return { targets: recipients.length, saved };
}

function buildPayload({ title, body, url = '/', image = null, tag = 'swingenjoy-notification', adminOnly = false, data = {} }) {
  const payloadData = {
    url,
    ...data,
  };
  if (adminOnly || data.adminOnly === true) {
    payloadData.adminOnly = true;
  } else {
    delete payloadData.adminOnly;
  }

  return JSON.stringify({
    title: title || '댄스빌보드 알림',
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: image || undefined,
    tag,
    renotify: true,
    data: payloadData,
  });
}

async function sendPushToRows(rows, payload, source = 'manual', delivery = {}) {
  getVapidConfig();

  const results = [];
  const staleRows = [];

  for (const row of rows) {
    const subscription = getSubscriptionPayload(row);
    if (!subscription) {
      results.push({
        id: row.id,
        userId: row.user_id,
        status: 'skipped',
        reason: 'invalid_subscription_payload',
      });
      continue;
    }

    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: Math.max(0, Number(delivery.ttlSeconds ?? 3600)),
        ...(delivery.urgency ? { urgency: delivery.urgency } : {}),
        ...(delivery.topic ? { topic: delivery.topic } : {}),
        timeout: PUSH_SEND_TIMEOUT_MS,
      });
      results.push({
        id: row.id,
        userId: row.user_id,
        status: 'sent',
        ...endpointMeta(subscription.endpoint),
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      const message = error?.body || error?.message || String(error);
      const permanent = isStalePushError(statusCode, message);
      if (permanent) staleRows.push(row);
      results.push({
        id: row.id,
        userId: row.user_id,
        status: 'failed',
        statusCode,
        message,
        permanent,
        ...endpointMeta(subscription.endpoint),
      });
    }
  }

  if (staleRows.length > 0) {
    await deleteCafe24TableRows('user_push_subscriptions', staleRows);
  }

  const success = results.filter((result) => result.status === 'sent').length;
  const failure = results.filter((result) => result.status === 'failed').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;

  console.info('[PushSendServer] send summary', {
    source,
    targets: rows.length,
    success,
    failure,
    skipped,
    staleDeleted: staleRows.length,
  });

  return {
    status: success > 0 ? 'ok' : rows.length > 0 ? 'warning' : 'empty',
    summary: {
      targets: rows.length,
      success,
      failure,
      skipped,
      staleDeleted: staleRows.length,
    },
    results,
  };
}

export async function sendPushNotification(req, res) {
  await requireAdmin(req);
  const body = req.body || {};
  const requestedUserId = body.userId ? String(body.userId) : '';
  const adminRows = await loadAdminSubscriptions();
  const targetRows = requestedUserId
    ? adminRows.filter((row) => String(row.user_id || '') === requestedUserId)
    : adminRows;

  const payload = buildPayload({
    title: body.title,
    body: body.body,
    url: body.url || '/',
    image: body.image,
    tag: body.tag || 'swingenjoy-admin-test',
    adminOnly: true,
    data: {
      category: body.category || null,
      genre: body.genre || null,
      content: body.content || null,
      queueSource: 'admin_manual_test',
    },
  });

  const result = await sendPushToRows(targetRows, payload, 'admin_manual_test');
  res.json({
    ...result,
    adminOnly: true,
    requestedUserId: requestedUserId || null,
  });
}

export async function sendBoardCommentNotification(req, res) {
  const user = await getCurrentUser(req);
  if (!user?.id) throw httpError('로그인이 필요합니다.', 401);

  const commentId = String(req.body?.commentId || '').trim();
  if (!commentId) throw httpError('commentId is required', 400);

  const [comments, posts] = await Promise.all([
    loadCafe24TableRows('board_comments'),
    loadCafe24TableRows('board_posts'),
  ]);
  const comment = comments.find((row) => String(row.id) === commentId);
  if (!comment) throw httpError('댓글을 찾을 수 없습니다.', 404);
  if (String(comment.user_id || '') !== String(user.id)) {
    throw httpError('댓글 알림을 보낼 권한이 없습니다.', 403);
  }

  const post = posts.find((row) => String(row.id) === String(comment.post_id));
  if (!post?.user_id) {
    res.json({ status: 'skipped', reason: 'post_author_missing' });
    return;
  }

  const authorUserId = String(post.user_id);
  if (authorUserId === String(user.id)) {
    res.json({ status: 'skipped', reason: 'self_comment' });
    return;
  }

  const title = String(post.title || '자유게시판 글');
  const commenter = String(comment.author_name || user.nickname || user.name || '회원');
  const notificationTitle = '내 글에 새 댓글이 달렸습니다';
  const notificationBody = `${commenter}님이 “${title}” 글에 댓글을 남겼습니다.`;
  const notificationUrl = `/board/free/detail/${encodeURIComponent(String(post.id))}`;
  const notificationData = {
    kind: 'board_comment',
    postId: String(post.id),
    commentId,
  };
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT IGNORE INTO user_notifications
       (user_id, title, body, url, kind, source_id, data_json)
     VALUES (?, ?, ?, ?, 'board_comment', ?, ?)`,
    [
      authorUserId,
      notificationTitle,
      notificationBody,
      notificationUrl,
      commentId,
      JSON.stringify(notificationData),
    ],
  );

  const subscriptions = await loadPushSubscriptions();
  const authorPreferences = await getUserNotificationPreferences(authorUserId);
  if (authorPreferences && !asBool(authorPreferences.enabled)) {
    res.json({ status: 'saved', push: 'skipped', reason: 'notifications_disabled' });
    return;
  }
  const targetRows = subscriptions.filter((row) => String(row.user_id || '') === authorUserId);
  if (targetRows.length === 0) {
    res.json({ status: 'saved', push: 'skipped', reason: 'author_not_subscribed' });
    return;
  }

  const payload = buildPayload({
    title: notificationTitle,
    body: notificationBody,
    url: notificationUrl,
    tag: `board-comment-${commentId}`,
    data: notificationData,
  });

  const result = await sendPushToRows(targetRows, payload, 'board_comment');
  res.json({
    ...result,
    recipientUserId: authorUserId,
  });
}

export async function listUserNotifications(req, res) {
  const user = await getCurrentUser(req);
  if (!user?.id) throw httpError('로그인이 필요합니다.', 401);

  const pool = getMysqlPool();
  const unreadOnly = String(req.query?.unread || '') === '1';
  const [rows] = await pool.execute(
    `SELECT id, title, body, url, kind, data_json, is_read, created_at
       FROM user_notifications
      WHERE user_id = ?${unreadOnly ? ' AND is_read = 0' : ''}
      ORDER BY created_at DESC
      LIMIT 100`,
    [String(user.id)],
  );
  const parsedRows = rows.map((row) => ({
      id: `server:${row.id}`,
      title: row.title,
      body: row.body,
      url: row.url,
      received_at: row.created_at,
      is_read: Boolean(row.is_read),
      data: { ...parseJsonValue(row.data_json, {}), notificationKind: row.kind },
  }));
  const newEventIds = new Set(parsedRows
    .filter((row) => row.data.notificationKind === 'new_event' && row.data.eventId)
    .map((row) => String(row.data.eventId)));
  let eventById = new Map();
  if (newEventIds.size > 0) {
    const events = await loadCafe24TableRows('events');
    eventById = new Map(events.map((event) => [String(event.id), event]));
  }
  const today = kstDateParts().dateKey;
  const notifications = parsedRows.map((row) => {
    if (row.data.notificationKind !== 'new_event' || !row.data.eventId) return row;
    const event = eventById.get(String(row.data.eventId));
    const lastDate = event ? eventLastDateKey(event) : normalizeDateKey(row.data.endDate || row.data.date);
    return lastDate && lastDate < today ? { ...row, is_read: true } : row;
  });
  res.json({ notifications: unreadOnly ? notifications.filter((row) => !row.is_read) : notifications });
}

export async function markUserNotificationsRead(req, res) {
  const user = await getCurrentUser(req);
  if (!user?.id) throw httpError('로그인이 필요합니다.', 401);

  const pool = getMysqlPool();
  const rawId = String(req.body?.id || '');
  const kind = String(req.body?.kind || '').trim();
  const sourceId = String(req.body?.sourceId || '').trim();
  if (rawId) {
    const id = rawId.replace(/^server:/, '');
    await pool.execute(
      `UPDATE user_notifications
          SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
      [id, String(user.id)],
    );
  } else if (kind && sourceId) {
    await pool.execute(
      `UPDATE user_notifications
          SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND kind = ? AND source_id = ?`,
      [String(user.id), kind, sourceId],
    );
  } else {
    await pool.execute(
      `UPDATE user_notifications
          SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND is_read = 0`,
      [String(user.id)],
    );
  }
  res.json({ ok: true });
}

function buildDailyDigestPayload(events, dateKey) {
  const sorted = [...events].sort((a, b) => {
    const at = String(a.time || a.start_time || '').localeCompare(String(b.time || b.start_time || ''));
    return at || String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  });
  const first = sorted[0] || {};
  const firstTime = String(first.time || first.start_time || '').slice(0, 5);
  const firstPlace = first.place_name || first.venue_name || first.location || '장소 미정';
  const firstLine = first.title ? `${firstTime ? `${firstTime} ` : ''}${first.title} · ${firstPlace}` : '';

  return buildPayload({
    title: sorted.length > 0 ? `오늘 일정 ${sorted.length}개` : '오늘 일정 없음',
    body: sorted.length > 0 ? `${firstLine}${sorted.length > 1 ? ` 외 ${sorted.length - 1}개` : ''}` : '오늘 등록된 스윙 일정이 없습니다.',
    url: `/calendar?date=${dateKey}&scrollToToday=true`,
    image: first.image_thumbnail || first.image_medium || first.image || first.image_full || null,
    tag: `daily-schedule-${dateKey}`,
    data: {
      kind: 'daily_schedule_morning',
      queueSource: 'daily_schedule_morning',
      date: dateKey,
      count: sorted.length,
      items: sorted.slice(0, 8).map((event, index) => ({
        eventId: String(event.id),
        title: event.title,
        url: `/calendar?id=${event.id}&date=${dateKey}`,
        order: index,
      })),
    },
  });
}

export async function sendDailyDigestToAdmins(req, res) {
  await requireAdmin(req);
  const { dateKey } = kstDateParts();
  const requestedDate = normalizeDateKey(req.body?.date || req.query?.date) || dateKey;
  const allEvents = await loadCafe24TableRows('events');
  const adminRows = (await loadAdminSubscriptions())
    .filter((row) => asBool(getStoredPreferences(row).pref_today_digest));

  const results = [];
  for (const row of adminRows) {
    const prefs = getStoredPreferences(row);
    const events = allEvents
      .filter((event) => eventOccursOnDate(event, requestedDate))
      .filter((event) => eventMatchesDigestPrefs(event, prefs));

    if (events.length === 0 && asBool(prefs.pref_only_with_events)) {
      results.push({
        id: row.id,
        userId: row.user_id,
        status: 'skipped',
        reason: 'no_events',
      });
      continue;
    }

    const payload = buildDailyDigestPayload(events, requestedDate);
    const result = await sendPushToRows([row], payload, 'daily_schedule_morning_admin_test');
    results.push({ id: row.id, userId: row.user_id, events: events.length, ...result.summary });
  }

  res.json({
    status: 'ok',
    adminOnly: true,
    date: requestedDate,
    summary: {
      targets: adminRows.length,
      sent: results.reduce((sum, item) => sum + (Number(item.success) || 0), 0),
      skipped: results.filter((item) => item.status === 'skipped').length,
    },
    results,
  });
}

async function processDueNotificationQueueUnlocked(source = 'notification_queue') {
  const now = new Date().toISOString();
  const dueQueueRows = (await loadCafe24TableRows('notification_queue'))
    .filter((row) => String(row.status || 'pending') === 'pending')
    .filter((row) => !row.next_attempt_at || String(row.next_attempt_at) <= now)
    .filter((row) => !row.scheduled_at || String(row.scheduled_at) <= now);
  const suppressPushBurst = dueQueueRows.length > NOTIFICATION_QUEUE_PUSH_BURST_LIMIT;
  const queueRows = suppressPushBurst ? dueQueueRows : dueQueueRows.slice(0, 20);

  const [allRows, adminUserIds] = await Promise.all([
    loadPushSubscriptions(),
    loadAdminUserIds(),
  ]);
  const inboxRecipients = await loadNotificationInboxRecipients();
  const preferenceRows = await loadEnabledNotificationPreferences();
  const processed = [];

  for (const queueRow of queueRows) {
    const payloadData = parseJsonValue(queueRow.payload, queueRow.payload || {});
    const requestedUserId = payloadData?.userId ? String(payloadData.userId) : '';
    const inboxTargetRecipients = inboxRecipients.filter((row) => (
      (!requestedUserId || String(row.user_id) === requestedUserId)
      && (payloadData?.adminOnly !== true || adminUserIds.has(String(row.user_id)))
    ));
    const queuedAt = Date.parse(String(queueRow.created_at || queueRow.scheduled_at || ''));
    const unseenInboxRecipients = inboxTargetRecipients.filter((row) => {
      const lastSeenAt = Date.parse(String(row.last_seen_at || ''));
      return !Number.isFinite(queuedAt) || !Number.isFinite(lastSeenAt) || lastSeenAt < queuedAt;
    });
    if (Number.isFinite(queuedAt) && Date.now() - queuedAt > NOTIFICATION_QUEUE_MAX_AGE_MS) {
      const inbox = await saveInboxNotifications(unseenInboxRecipients, {
        title: queueRow.title,
        body: queueRow.body,
        url: payloadData?.url || '/',
        kind: 'new_event',
        sourceId: queueRow.id,
        data: { ...payloadData, queueId: queueRow.id, queueSource: source },
      });
      const expiredResult = {
        status: 'expired',
        message: 'notification queue item exceeded the delivery age limit',
        inbox,
      };
      await saveCafe24TableRow('notification_queue', {
        ...queueRow,
        status: 'expired',
        processed_at: new Date().toISOString(),
        result: expiredResult,
      }, ['id']);
      processed.push({ id: queueRow.id, targetCount: 0, result: expiredResult });
      continue;
    }

    const eventLike = {
      category: queueRow.category || payloadData?.category,
      activity_type: queueRow.category || payloadData?.category,
      event_type: payloadData?.eventType,
      genre: payloadData?.genre,
      tags: payloadData?.tags,
    };
    const eligiblePreferences = preferenceRows.filter((prefs) => (
      (!requestedUserId || String(prefs.user_id) === requestedUserId)
      && (payloadData?.adminOnly !== true || adminUserIds.has(String(prefs.user_id)))
      && asBool(prefs.pref_new_event_alerts)
      && eventMatchesNewEventPrefs(eventLike, prefs)
    ));
    const eligibleUserIds = new Set(eligiblePreferences.map((prefs) => String(prefs.user_id)));
    const storedDeliveredIds = Array.isArray(queueRow.delivered_subscription_ids)
      ? queueRow.delivered_subscription_ids
      : parseJsonValue(queueRow.delivered_subscription_ids, []);
    const deliveredSubscriptionIds = new Set(
      (Array.isArray(storedDeliveredIds) ? storedDeliveredIds : []).map(String),
    );
    const targetRows = allRows.filter((row) => (
      eligibleUserIds.has(String(row.user_id || ''))
      && !deliveredSubscriptionIds.has(String(row.id))
    ));

    const payload = buildPayload({
      title: queueRow.title,
      body: queueRow.body,
      url: payloadData?.url || '/',
      image: payloadData?.image || null,
      tag: `notification-queue-${queueRow.id}`,
      data: {
      ...payloadData,
      queueId: queueRow.id,
        queueSource: source,
      },
    });

    let result;
    try {
      const inbox = await saveInboxNotifications(unseenInboxRecipients, {
        title: queueRow.title,
        body: queueRow.body,
        url: payloadData?.url || '/',
        kind: 'new_event',
        sourceId: queueRow.id,
        data: {
          ...payloadData,
          queueId: queueRow.id,
          queueSource: source,
        },
      });
      const push = suppressPushBurst
        ? {
            status: 'suppressed',
            summary: {
              targets: targetRows.length,
              success: 0,
              failure: 0,
              skipped: targetRows.length,
              staleDeleted: 0,
            },
            results: targetRows.map((row) => ({
              id: row.id,
              userId: row.user_id,
              status: 'skipped',
              reason: 'burst_suppressed',
            })),
          }
        : await sendPushToRows(targetRows, payload, source, {
            ttlSeconds: Math.max(60, Math.floor(NOTIFICATION_QUEUE_MAX_AGE_MS / 1000)),
            urgency: 'normal',
            topic: crypto.createHash('sha256').update(String(queueRow.id)).digest('base64url').slice(0, 32),
          });
      result = { ...push, inbox };
      push.results
        .filter((item) => item.status === 'sent')
        .forEach((item) => deliveredSubscriptionIds.add(String(item.id)));
      const attemptCount = Number(queueRow.attempt_count || 0) + 1;
      const retryableFailures = push.results.filter((item) => item.status === 'failed' && item.permanent !== true).length;
      const shouldRetry = retryableFailures > 0 && attemptCount < NOTIFICATION_QUEUE_MAX_ATTEMPTS;
      const retryDelayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
      await saveCafe24TableRow('notification_queue', {
        ...queueRow,
        status: shouldRetry
          ? 'pending'
          : inbox.targets > 0 || deliveredSubscriptionIds.size > 0
            ? 'sent'
            : 'skipped',
        attempt_count: attemptCount,
        next_attempt_at: shouldRetry
          ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString()
          : null,
        delivered_subscription_ids: [...deliveredSubscriptionIds],
        processed_at: shouldRetry ? null : new Date().toISOString(),
        result,
      }, ['id']);
    } catch (error) {
      const attemptCount = Number(queueRow.attempt_count || 0) + 1;
      const shouldRetry = attemptCount < NOTIFICATION_QUEUE_MAX_ATTEMPTS;
      const retryDelayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
      result = {
        status: shouldRetry ? 'retrying' : 'failed',
        message: error?.message || String(error),
      };
      await saveCafe24TableRow('notification_queue', {
        ...queueRow,
        status: shouldRetry ? 'pending' : 'failed',
        attempt_count: attemptCount,
        next_attempt_at: shouldRetry
          ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString()
          : null,
        processed_at: shouldRetry ? null : new Date().toISOString(),
        result,
      }, ['id']);
    }

    processed.push({
      id: queueRow.id,
      recipientCount: eligiblePreferences.length,
      targetCount: targetRows.length,
      result,
    });
  }

  return processed;
}

async function processDueNotificationQueue(source = 'notification_queue') {
  if (notificationQueueRun) return await notificationQueueRun;
  notificationQueueRun = processDueNotificationQueueUnlocked(source);
  try {
    return await notificationQueueRun;
  } finally {
    notificationQueueRun = null;
  }
}

function assertCronAccess(req) {
  const expectedToken = process.env.PUSH_CRON_TOKEN || '';
  const providedToken = req.headers['x-cron-token'] || req.query?.token || req.body?.token || '';
  const allowLocal = process.env.NODE_ENV !== 'production' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(req.socket?.remoteAddress || ''));
  if (expectedToken && providedToken !== expectedToken && !allowLocal) {
    throw httpError('Invalid cron token', 403);
  }
  if (!expectedToken && !allowLocal) {
    throw httpError('PUSH_CRON_TOKEN is required for cron delivery.', 503);
  }
}

export async function processNotificationQueue(req, res) {
  await requireAdmin(req);
  const processed = await processDueNotificationQueue('notification_queue_admin_button');
  res.json({
    status: 'ok',
    adminOnly: false,
    processed: processed.length,
    items: processed,
  });
}

export async function dailyDigestCron(req, res) {
  assertCronAccess(req);

  const now = kstDateParts();
  const allEvents = await loadCafe24TableRows('events');
  const subscriptions = await loadPushSubscriptions();
  const targetPreferences = (await loadEnabledNotificationPreferences()).filter((prefs) => {
    return asBool(prefs.pref_today_digest)
      && prefs.pref_digest_time === now.timeKey
      && Array.isArray(prefs.pref_digest_days)
      && prefs.pref_digest_days.map(Number).includes(now.day);
  });

  const sentRows = [];
  for (const prefs of targetPreferences) {
    const events = allEvents
      .filter((event) => eventOccursOnDate(event, now.dateKey))
      .filter((event) => eventMatchesDigestPrefs(event, prefs));
    if (events.length === 0 && asBool(prefs.pref_only_with_events)) continue;
    const payload = buildDailyDigestPayload(events, now.dateKey);
    const inbox = await saveInboxNotifications([prefs], {
      title: events.length > 0 ? `오늘 일정 ${events.length}개` : '오늘 일정 없음',
      body: events.length > 0
        ? `${events[0]?.title || '오늘 일정'}${events.length > 1 ? ` 외 ${events.length - 1}개` : ''}`
        : '오늘 등록된 스윙 일정이 없습니다.',
      url: `/calendar?date=${now.dateKey}&scrollToToday=true`,
      kind: 'daily_schedule',
      sourceId: now.dateKey,
      data: { kind: 'daily_schedule_morning', date: now.dateKey, count: events.length },
    });
    if (inbox.saved === 0) {
      sentRows.push({
        status: 'duplicate',
        summary: { targets: 0, success: 0, failure: 0, skipped: 0, staleDeleted: 0 },
        inbox,
      });
      continue;
    }
    const targetRows = subscriptions.filter((row) => String(row.user_id || '') === String(prefs.user_id));
    sentRows.push({
      ...(await sendPushToRows(targetRows, payload, 'daily_schedule_morning_cron')),
      inbox,
    });
  }

  res.json({
    status: 'ok',
    adminOnly: false,
    date: now.dateKey,
    time: now.timeKey,
    targets: targetPreferences.length,
    sent: sentRows.reduce((sum, item) => sum + item.summary.success, 0),
  });
}

export async function notificationQueueCron(req, res) {
  assertCronAccess(req);
  const processed = await processDueNotificationQueue('notification_queue_cron');
  res.json({
    status: 'ok',
    adminOnly: false,
    processed: processed.length,
    items: processed,
  });
}
