import crypto from 'node:crypto';
import { getMysqlPool } from './mysql-pool.js';
import {
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';
import {
  isAnalyticsBotUserAgent,
  isAnalyticsInternalRouteRow,
} from './analytics-purity.js';

const EVENT_TABLE = /^[a-z0-9_]+$/i.test(process.env.MYSQL_EVENTS_TABLE || '')
  ? process.env.MYSQL_EVENTS_TABLE
  : 'events';
const SESSION_COOKIE = 'swingenjoy_session';

function parseCookies(req) {
  const cookie = req.headers.cookie || '';
  return Object.fromEntries(
    cookie
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function configuredAdminEmails() {
  return String(`${process.env.VITE_ADMIN_EMAIL || ''},${process.env.ADMIN_EMAIL || ''}`)
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

let analyticsAdminIdentityCache = {
  expiresAt: 0,
  userIds: new Set(),
  emails: new Set(),
  sessionIds: new Set(),
  fingerprints: new Set(),
};

function buildAnalyticsAdminDeviceIds(rows = [], userIds = new Set()) {
  const sessionIds = new Set();
  const fingerprints = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const row of rows) {
      const directAdmin = asBool(row?.is_admin, false)
        || (row?.user_id && userIds.has(String(row.user_id)));
      const linkedAdminDevice = Boolean(
        (row?.session_id && sessionIds.has(String(row.session_id))) ||
        (row?.fingerprint && fingerprints.has(String(row.fingerprint)))
      );
      if (!directAdmin && !linkedAdminDevice) continue;
      if (row?.session_id && !sessionIds.has(String(row.session_id))) {
        sessionIds.add(String(row.session_id));
        changed = true;
      }
      if (row?.fingerprint && !fingerprints.has(String(row.fingerprint))) {
        fingerprints.add(String(row.fingerprint));
        changed = true;
      }
    }
  }

  return { sessionIds, fingerprints };
}

async function getAnalyticsAdminIdentityCache() {
  const now = Date.now();
  if (analyticsAdminIdentityCache.expiresAt > now) return analyticsAdminIdentityCache;

  const pool = getMysqlPool();
  const [admins, userResult, boardUsers] = await Promise.all([
    loadCafe24TableRows('board_admins').catch(() => []),
    pool.execute('SELECT id, email, is_admin FROM users').then(([rows]) => rows).catch(() => []),
    loadCafe24TableRows('board_users').catch(() => []),
  ]);
  const users = Array.isArray(userResult) ? userResult : [];
  const userIds = new Set();
  const emails = new Set(configuredAdminEmails());
  for (const admin of admins) {
    if (admin?.user_id) userIds.add(String(admin.user_id));
    const email = normalizeEmail(admin?.email || admin?.admin_email);
    if (email) emails.add(email);
  }
  for (const user of users) {
    const email = normalizeEmail(user?.email);
    if (asBool(user?.is_admin, false) || (email && emails.has(email))) {
      if (user?.id) userIds.add(String(user.id));
      if (email) emails.add(email);
    }
  }
  for (const boardUser of boardUsers) {
    const email = normalizeEmail(boardUser?.email || boardUser?.admin_email);
    if (asBool(boardUser?.is_admin, false) || (email && emails.has(email))) {
      if (boardUser?.user_id) userIds.add(String(boardUser.user_id));
      if (email) emails.add(email);
    }
  }
  const [sessions, logs] = await Promise.all([
    loadCafe24TableRows('session_logs').catch(() => []),
    loadCafe24TableRows('site_analytics_logs').catch(() => []),
  ]);
  const { sessionIds, fingerprints } = buildAnalyticsAdminDeviceIds([...sessions, ...logs], userIds);

  analyticsAdminIdentityCache = {
    expiresAt: now + 300_000,
    userIds,
    emails,
    sessionIds,
    fingerprints,
  };
  return analyticsAdminIdentityCache;
}

function asString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function asInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
}

function asIso(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) return fallback.toISOString();
  return date.toISOString();
}

function requestUserAgent(req, body) {
  return asString(body.user_agent) || asString(req.headers['user-agent']);
}

function isAnalyticsBotPayload(body, req) {
  return isAnalyticsBotUserAgent(requestUserAgent(req, body));
}

function isInternalAnalyticsPayload(body) {
  return isAnalyticsInternalRouteRow({
    ...body,
    page_url: eventPath(body),
  });
}

function cleanIp(value) {
  const raw = asString(value);
  if (!raw) return null;
  return raw
    .replace(/^::ffff:/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .trim()
    .slice(0, 80);
}

function requestClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || '').split(',')[0];
  return cleanIp(firstForwarded)
    || cleanIp(req.headers['x-real-ip'])
    || cleanIp(req.ip)
    || cleanIp(req.socket?.remoteAddress);
}

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
}

async function getAnalyticsRequestUser(req, pool) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return null;

  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.is_admin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > NOW()
      LIMIT 1`,
    [sessionId],
  );
  const user = rows[0];
  if (!user) return null;

  const userId = String(user.id);
  const email = normalizeEmail(user.email);
  const adminIdentities = await getAnalyticsAdminIdentityCache();
  const isAdmin = asBool(user.is_admin, false)
    || adminIdentities.userIds.has(userId)
    || (email && adminIdentities.emails.has(email));

  return { id: userId, is_admin: isAdmin };
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getEventStartDate(event = {}) {
  return asString(event.start_date || event.date || event.date_value);
}

function getEventCategory(event = {}) {
  const category = String(event.category || '').toLowerCase();
  const title = String(event.title || '').toLowerCase();
  if (category.includes('class') || title.includes('강습') || title.includes('모집')) return '강습';
  if (category.includes('social') || category.includes('group') || event.group_id || title.includes('소셜')) return '동호회 이벤트+소셜';
  return '행사';
}

function getEventGenre(event = {}) {
  return asString(event.genre || event.dance_genre || event.dance_scope) || '기타';
}

function getWeekdayLabel(dateValue) {
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00+09:00`);
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return labels[date.getDay()] || '-';
}

function emptyDayStats(label) {
  return {
    day: label,
    count: 0,
    typeBreakdown: [],
    genreBreakdown: [],
    topGenre: '-',
    items: [],
  };
}

function addBreakdown(map, key, amount = 1) {
  const safeKey = key || '기타';
  map.set(safeKey, (map.get(safeKey) || 0) + amount);
}

function breakdownArray(map) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildDayStats(dayMap) {
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return labels.map((day) => {
    const bucket = dayMap.get(day);
    if (!bucket) return emptyDayStats(day);
    const genreBreakdown = breakdownArray(bucket.genres);
    return {
      day,
      count: bucket.items.length,
      typeBreakdown: breakdownArray(bucket.types),
      genreBreakdown,
      topGenre: genreBreakdown[0]?.name || '-',
      items: bucket.items,
    };
  });
}

function incrementEventStats(stats, event) {
  const startDate = getEventStartDate(event);
  if (!startDate) return;

  const category = getEventCategory(event);
  const genre = getEventGenre(event);
  const day = getWeekdayLabel(startDate);
  const item = {
    type: category,
    title: event.title || 'Untitled',
    date: String(startDate).slice(0, 10),
    createdAt: event.created_at || event.updated_at || '',
    genre,
    day,
  };

  const weekdayBucket = stats.totalWeeklyMap.get(day) || { items: [], types: new Map(), genres: new Map() };
  weekdayBucket.items.push(item);
  addBreakdown(weekdayBucket.types, category);
  addBreakdown(weekdayBucket.genres, genre);
  stats.totalWeeklyMap.set(day, weekdayBucket);

  const now = new Date();
  const eventMonth = String(startDate).slice(0, 7);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (eventMonth === currentMonth) {
    const monthBucket = stats.monthlyWeeklyMap.get(day) || { items: [], types: new Map(), genres: new Map() };
    monthBucket.items.push(item);
    addBreakdown(monthBucket.types, category);
    addBreakdown(monthBucket.genres, genre);
    stats.monthlyWeeklyMap.set(day, monthBucket);
  }

  const monthlyBucket = stats.monthlyMap.get(eventMonth) || {
    month: eventMonth,
    classes: 0,
    events: 0,
    socials: 0,
    clubs: 0,
    total: 0,
    registrations: 0,
    dailyAvg: 0,
    maxDaily: 0,
    maxDailyDate: null,
    daily: new Map(),
  };
  if (category === '강습') monthlyBucket.classes += 1;
  else if (category === '동호회 이벤트+소셜') monthlyBucket.socials += 1;
  else monthlyBucket.events += 1;
  monthlyBucket.total += 1;
  monthlyBucket.registrations += 1;
  const dayKey = String(startDate).slice(0, 10);
  monthlyBucket.daily.set(dayKey, (monthlyBucket.daily.get(dayKey) || 0) + 1);
  stats.monthlyMap.set(eventMonth, monthlyBucket);

  addBreakdown(stats.genreMap, genre);
}

async function loadGenericRows(table) {
  return loadCafe24TableRows(table);
}

async function buildCafe24SiteStats() {
  const pool = getMysqlPool();
  const [eventRows] = await pool.query(`SELECT raw_json FROM ${EVENT_TABLE}`);
  const events = eventRows.map((row) => parseJson(row.raw_json, {}));
  const [boardUsers, pwaInstalls, pushSubscriptions] = await Promise.all([
    loadGenericRows('board_users'),
    loadGenericRows('pwa_installs'),
    loadGenericRows('user_push_subscriptions'),
  ]);

  const stats = {
    totalWeeklyMap: new Map(),
    monthlyWeeklyMap: new Map(),
    monthlyMap: new Map(),
    genreMap: new Map(),
  };

  events.forEach((event) => incrementEventStats(stats, event));

  const monthly = Array.from(stats.monthlyMap.values())
    .map((month) => {
      let maxDaily = 0;
      let maxDailyDate = null;
      month.daily.forEach((count, date) => {
        if (count > maxDaily) {
          maxDaily = count;
          maxDailyDate = date;
        }
      });
      const [year, monthNumber] = month.month.split('-').map(Number);
      const daysInMonth = year && monthNumber ? new Date(year, monthNumber, 0).getDate() : 30;
      const { daily, ...rest } = month;
      return {
        ...rest,
        clubs: rest.socials,
        dailyAvg: Number((rest.total / Math.max(daysInMonth, 1)).toFixed(1)),
        maxDaily,
        maxDailyDate,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalWeekly = buildDayStats(stats.totalWeeklyMap);
  const monthlyWeekly = buildDayStats(stats.monthlyWeeklyMap);
  const topDay = [...totalWeekly].sort((a, b) => b.count - a.count)[0]?.day || '-';
  const topGenresList = breakdownArray(stats.genreMap).slice(0, 10).map((item) => item.name);
  const totalItems = events.length;
  const dailyAverage = monthly.length
    ? Number((monthly.reduce((sum, item) => sum + item.dailyAvg, 0) / monthly.length).toFixed(1))
    : 0;

  const memberCount = boardUsers.length;
  const pwaCount = new Set(pwaInstalls.map((row) => row.user_id).filter(Boolean).map(String)).size;
  const pushCount = new Set(pushSubscriptions.map((row) => row.user_id).filter(Boolean).map(String)).size;
  const eventBreakdown = {
    class: events.filter((event) => getEventCategory(event) === '강습').length,
    event: events.filter((event) => getEventCategory(event) === '행사').length,
    social: events.filter((event) => getEventCategory(event) === '동호회 이벤트+소셜').length,
  };

  const payload = {
    backend: 'cafe24-mysql',
    monthly,
    totalWeekly,
    monthlyWeekly,
    topGenresList,
    summary: {
      totalItems,
      dailyAverage,
      topDay,
      memberCount,
      pwaCount,
      pushCount,
    },
    eventBreakdown,
    leadTimeAnalysis: {
      classEarly: 0,
      classMid: 0,
      classLate: 0,
      eventEarly: 0,
      eventMid: 0,
      eventLate: 0,
    },
    generatedAt: new Date().toISOString(),
  };

  await saveCafe24TableRow('metrics_cache', {
    key: 'scene_analytics_v3',
    value: payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, ['key']);

  return payload;
}

function eventPath(body) {
  return (
    asString(body.path) ||
    asString(body.pathname) ||
    asString(body.page_url) ||
    asString(body.entry_page) ||
    asString(body.exit_page) ||
    asString(body.route)
  );
}

async function findSessionLog(sessionId) {
  if (!sessionId) return null;
  const rows = await loadCafe24TableRows('session_logs');
  return rows.find((row) => String(row.session_id || '') === String(sessionId)) || null;
}

async function linkAnonymousSessionEventsToUser({ userId, sessionId }) {
  if (!userId || !sessionId) return;

  const rows = await loadCafe24TableRows('site_analytics_logs');
  const now = new Date().toISOString();
  const targets = rows.filter((row) => (
    !row.user_id &&
    row.session_id &&
    String(row.session_id) === String(sessionId)
  ));

  for (const row of targets) {
    await saveCafe24TableRow('site_analytics_logs', {
      ...row,
      user_id: userId,
      updated_at: now,
    });
  }
}

async function saveSessionStart(body, req) {
  const sessionId = asString(body.session_id || body.sessionId);
  if (!sessionId) return;

  const now = new Date().toISOString();
  const existing = await findSessionLog(sessionId);
  const sessionStart = asIso(body.session_start || existing?.session_start, new Date());
  const row = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    session_id: sessionId,
    user_id: asString(body.user_id || body.userId) ?? existing?.user_id ?? null,
    fingerprint: asString(body.fingerprint) ?? existing?.fingerprint ?? null,
    is_admin: asBool(body.is_admin, asBool(existing?.is_admin, false)),
    session_start: sessionStart,
    page_views: asInt(body.page_views, existing?.page_views ?? 1) || 1,
    total_clicks: asInt(body.total_clicks, existing?.total_clicks ?? 0) || 0,
    entry_page: eventPath(body) ?? existing?.entry_page ?? null,
    referrer: asString(body.referrer) ?? existing?.referrer ?? asString(req.headers.referer),
    utm_source: asString(body.utm_source) ?? existing?.utm_source ?? null,
    utm_medium: asString(body.utm_medium) ?? existing?.utm_medium ?? null,
    utm_campaign: asString(body.utm_campaign) ?? existing?.utm_campaign ?? null,
    is_pwa: asBool(body.is_pwa, asBool(existing?.is_pwa, false)),
    pwa_display_mode: asString(body.pwa_display_mode) ?? existing?.pwa_display_mode ?? null,
    user_agent: requestUserAgent(req, body) ?? existing?.user_agent ?? null,
    client_ip: asString(body.client_ip) ?? existing?.client_ip ?? requestClientIp(req),
    ip_hash: asString(body.ip_hash) ?? existing?.ip_hash ?? hashIp(requestClientIp(req)),
    platform: asString(body.platform) ?? existing?.platform ?? null,
    created_at: existing?.created_at || sessionStart || now,
    updated_at: now,
  };

  await saveCafe24TableRow('session_logs', row, ['session_id']);
  if (row.user_id && (!existing || !existing.user_id)) {
    await linkAnonymousSessionEventsToUser({
      userId: row.user_id,
      sessionId: row.session_id,
    });
  }
}

async function saveSessionEnd(body, req) {
  const sessionId = asString(body.session_id || body.sessionId);
  if (!sessionId) return;

  const now = new Date().toISOString();
  const existing = await findSessionLog(sessionId);
  const row = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    session_id: sessionId,
    session_start: existing?.session_start || now,
    session_end: asIso(body.session_end, new Date()),
    exit_page: asString(body.exit_page) ?? existing?.exit_page ?? null,
    duration_seconds: asInt(body.duration_seconds, existing?.duration_seconds ?? null),
    total_clicks: asInt(body.total_clicks, existing?.total_clicks ?? 0) || 0,
    page_views: asInt(body.page_views, existing?.page_views ?? 1) || 1,
    user_id: asString(body.user_id || body.userId) ?? existing?.user_id ?? null,
    fingerprint: asString(body.fingerprint) ?? existing?.fingerprint ?? null,
    is_admin: asBool(body.is_admin, asBool(existing?.is_admin, false)),
    user_agent: existing?.user_agent || requestUserAgent(req, body) || null,
    platform: existing?.platform || asString(body.platform) || null,
    client_ip: existing?.client_ip || asString(body.client_ip) || requestClientIp(req),
    ip_hash: existing?.ip_hash || asString(body.ip_hash) || hashIp(asString(body.client_ip) || requestClientIp(req)),
    created_at: existing?.created_at || existing?.session_start || now,
    updated_at: now,
  };

  await saveCafe24TableRow('session_logs', row, ['session_id']);
}

async function saveAnalyticsEvent(body, req) {
  const now = new Date().toISOString();
  const createdAt = asIso(body.created_at || body.timestamp, new Date());
  const row = {
    id: asString(body.id) || crypto.randomUUID(),
    target_id: asString(body.target_id || body.targetId || body.event_id) || eventPath(body) || 'activity',
    target_type: asString(body.target_type || body.targetType || body.type) || 'activity',
    target_title: asString(body.target_title || body.targetTitle || body.title),
    section: asString(body.section) || asString(body.category) || 'site',
    category: asString(body.category),
    route: asString(body.route) || eventPath(body),
    user_id: asString(body.user_id || body.userId),
    fingerprint: asString(body.fingerprint),
    is_admin: asBool(body.is_admin, false),
    user_agent: requestUserAgent(req, body),
    client_ip: asString(body.client_ip) || requestClientIp(req),
    ip_hash: asString(body.ip_hash) || hashIp(asString(body.client_ip) || requestClientIp(req)),
    created_at: createdAt,
    session_id: asString(body.session_id || body.sessionId),
    sequence_number: asInt(body.sequence_number, null),
    referrer: asString(body.referrer) || asString(req.headers.referer),
    utm_source: asString(body.utm_source),
    utm_medium: asString(body.utm_medium),
    utm_campaign: asString(body.utm_campaign),
    landing_page: asString(body.landing_page),
    page_url: asString(body.page_url) || eventPath(body),
    updated_at: now,
  };

  await saveCafe24TableRow('site_analytics_logs', row);
}

export async function saveCafe24AnalyticsCompat(body, req) {
  const action = asString(body.action) || (body.session_start ? 'start' : body.session_end ? 'end' : body.target_type ? 'event' : null);

  if (action === 'start') {
    await saveSessionStart(body, req);
    return;
  }

  if (action === 'end') {
    await saveSessionEnd(body, req);
    return;
  }

  if (action === 'event') {
    if (body.session_id || body.sessionId) {
      const existing = await findSessionLog(body.session_id || body.sessionId);
      if (!existing) await saveSessionStart({ ...body, entry_page: eventPath(body), page_views: 1 }, req);
    }
    await saveAnalyticsEvent(body, req);
  }
}

export async function eventStats(_req, res) {
  const pool = getMysqlPool();
  const [[summary]] = await pool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(COALESCE(end_date, start_date, date_value) >= CURDATE()) AS upcoming,
      SUM(DATE_FORMAT(COALESCE(start_date, date_value), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS this_month
    FROM ${EVENT_TABLE}
  `);

  const [categories] = await pool.query(`
    SELECT COALESCE(category, 'etc') AS category, COUNT(*) AS count
      FROM ${EVENT_TABLE}
     GROUP BY COALESCE(category, 'etc')
     ORDER BY count DESC
  `);

  const [genres] = await pool.query(`
    SELECT COALESCE(NULLIF(genre, ''), '기타') AS genre, COUNT(*) AS count
      FROM ${EVENT_TABLE}
     GROUP BY COALESCE(NULLIF(genre, ''), '기타')
     ORDER BY count DESC
     LIMIT 20
  `);

  const [weekdays] = await pool.query(`
    SELECT DAYOFWEEK(COALESCE(start_date, date_value)) AS weekday, COUNT(*) AS count
      FROM ${EVENT_TABLE}
     WHERE COALESCE(start_date, date_value) IS NOT NULL
     GROUP BY DAYOFWEEK(COALESCE(start_date, date_value))
     ORDER BY weekday ASC
  `);

  res.json({
    backend: 'cafe24-mysql',
    summary,
    categories,
    genres,
    weekdays,
    generatedAt: new Date().toISOString(),
  });
}

export async function recordAnalytics(req, res) {
  const pool = getMysqlPool();
  const requestIp = requestClientIp(req);
  const currentUser = await getAnalyticsRequestUser(req, pool).catch(() => null);
  const trustedUserId = currentUser?.id ? String(currentUser.id) : null;
  let trustedIsAdmin = Boolean(currentUser?.is_admin);
  if (!trustedIsAdmin) {
    const adminIdentities = await getAnalyticsAdminIdentityCache();
    const requestSessionId = asString(req.body?.session_id || req.body?.sessionId);
    const requestFingerprint = asString(req.body?.fingerprint);
    trustedIsAdmin = Boolean(
      (requestSessionId && adminIdentities.sessionIds.has(requestSessionId)) ||
      (requestFingerprint && adminIdentities.fingerprints.has(requestFingerprint))
    );
  }
  const body = {
    ...(req.body || {}),
    user_id: trustedUserId,
    userId: trustedUserId,
    is_admin: trustedIsAdmin,
    client_ip: req.body?.client_ip || requestIp,
    ip_hash: req.body?.ip_hash || hashIp(requestIp),
  };

  if (asBool(body.analytics_excluded, false) || trustedIsAdmin || isAnalyticsBotPayload(body, req) || isInternalAnalyticsPayload(body)) {
    res.json({ ok: true, skipped: true });
    return;
  }

  await pool.execute(
    `INSERT INTO analytics_logs (
       session_id, user_id, event_type, path, title, referrer, user_agent, raw_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.sessionId || body.session_id || null,
      body.userId || body.user_id || null,
      body.eventType || body.event_type || body.type || 'activity',
      eventPath(body) || null,
      body.title || body.target_title || body.targetTitle || null,
      body.referrer || req.headers.referer || null,
      req.headers['user-agent'] || null,
      JSON.stringify(body),
    ],
  );

  await saveCafe24AnalyticsCompat(body, req);

  res.json({ ok: true });
}

export async function siteStats(_req, res) {
  res.json(await buildCafe24SiteStats());
}
