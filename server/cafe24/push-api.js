import webpush from 'web-push';
import { requireAdmin } from './auth-api.js';
import { getMysqlPool } from './mysql-pool.js';
import {
  deleteCafe24TableRows,
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';

const DEFAULT_PUBLIC_VAPID_KEY = 'BGI9DEEYcY0HtnDAA6Ae7HJb7bEh5XGSkV3dH7QYzpA5fjyDoVMuwTGQoPa0mcSrIRMyycYStDaaa1nqtwt9Ih0';
const DEFAULT_DAILY_DIGEST_TIME = '08:30';
const STALE_PUSH_STATUS_CODES = new Set([404, 410]);
const PUSH_SEND_TIMEOUT_MS = Math.max(1000, Number(process.env.PUSH_SEND_TIMEOUT_MS || 8000));
const VAPID_MISMATCH_RE = /vapid credentials.*do not correspond/i;

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

function eventMatchesDigestPrefs(event, prefs = {}) {
  const category = String(event.category || event.activity_type || '').toLowerCase();
  if ((category === 'class' || category === 'regular') && !asBool(prefs.pref_class ?? true)) return false;
  if (category === 'club' && !asBool(prefs.pref_clubs ?? true)) return false;
  if (!['class', 'regular', 'club'].includes(category) && !asBool(prefs.pref_events ?? true)) return false;
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

async function loadAdminSubscriptions() {
  const rows = await loadPushSubscriptions();
  const pool = getMysqlPool();
  const [adminUsers] = await pool.execute('SELECT id FROM users WHERE is_admin = 1');
  const adminUserIds = new Set(adminUsers.map((row) => String(row.id)));
  return rows.filter((row) => asBool(row.is_admin) || adminUserIds.has(String(row.user_id || '')));
}

async function loadPushSubscriptions() {
  return await loadCafe24TableRows('user_push_subscriptions');
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

async function sendPushToRows(rows, payload, source = 'manual') {
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
        TTL: 3600,
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
      if (isStalePushError(statusCode, message)) staleRows.push(row);
      results.push({
        id: row.id,
        userId: row.user_id,
        status: 'failed',
        statusCode,
        message,
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

async function processDueNotificationQueue(source = 'notification_queue') {
  const now = new Date().toISOString();
  const queueRows = (await loadCafe24TableRows('notification_queue'))
    .filter((row) => String(row.status || 'pending') === 'pending')
    .filter((row) => !row.scheduled_at || String(row.scheduled_at) <= now)
    .slice(0, 20);

  const allRows = await loadPushSubscriptions();
  const adminRows = await loadAdminSubscriptions();
  const processed = [];

  for (const queueRow of queueRows) {
    const payloadData = parseJsonValue(queueRow.payload, queueRow.payload || {});
    const requestedUserId = payloadData?.userId ? String(payloadData.userId) : '';
    const eventLike = {
      category: queueRow.category || payloadData?.category,
      activity_type: queueRow.category || payloadData?.category,
    };
    const baseRows = payloadData?.adminOnly === true ? adminRows : allRows;
    const targetRows = (requestedUserId
      ? baseRows.filter((row) => String(row.user_id || '') === requestedUserId)
      : baseRows
    ).filter((row) => {
      const prefs = getStoredPreferences(row);
      return asBool(prefs.pref_new_event_alerts) && eventMatchesNewEventPrefs(eventLike, prefs);
    });

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
      result = await sendPushToRows(targetRows, payload, source);
      await saveCafe24TableRow('notification_queue', {
        ...queueRow,
        status: result.summary.success > 0 ? 'sent' : 'failed',
        processed_at: new Date().toISOString(),
        result,
      }, ['id']);
    } catch (error) {
      result = {
        status: 'failed',
        message: error?.message || String(error),
      };
      await saveCafe24TableRow('notification_queue', {
        ...queueRow,
        status: 'failed',
        processed_at: new Date().toISOString(),
        result,
      }, ['id']);
    }

    processed.push({ id: queueRow.id, targetCount: targetRows.length, result });
  }

  return processed;
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
  const targetRows = (await loadPushSubscriptions()).filter((row) => {
    const prefs = getStoredPreferences(row);
    return asBool(prefs.pref_today_digest)
      && prefs.pref_digest_time === now.timeKey
      && Array.isArray(prefs.pref_digest_days)
      && prefs.pref_digest_days.map(Number).includes(now.day);
  });

  const sentRows = [];
  for (const row of targetRows) {
    const prefs = getStoredPreferences(row);
    const events = allEvents
      .filter((event) => eventOccursOnDate(event, now.dateKey))
      .filter((event) => eventMatchesDigestPrefs(event, prefs));
    if (events.length === 0 && asBool(prefs.pref_only_with_events)) continue;
    const payload = buildDailyDigestPayload(events, now.dateKey);
    sentRows.push(await sendPushToRows([row], payload, 'daily_schedule_morning_cron'));
  }

  res.json({
    status: 'ok',
    adminOnly: false,
    date: now.dateKey,
    time: now.timeKey,
    targets: targetRows.length,
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
