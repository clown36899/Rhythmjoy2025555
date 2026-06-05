import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 1000;
const SESSION_DURATION_CAP_SECONDS = 30 * 60;
const EXCLUDED_USER_PREFIX = '91b04b25';
const BOT_UA_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap|naverbot|googlebot|bingbot|yeti|daumoa|lighthouse|headless|phantom|puppeteer|playwright|curl|wget|python-requests/i;

async function fetchAll(table, select, orderColumn) {
  const rows = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function getKRDateString(date) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isValidRow(row) {
  if (row.is_admin) return false;
  if (row.user_id && String(row.user_id).startsWith(EXCLUDED_USER_PREFIX)) return false;
  if (row.user_agent && BOT_UA_PATTERN.test(row.user_agent)) return false;
  return true;
}

function getVisitorKey(row, fpToUser, fallback) {
  const fingerprint = row.fingerprint ? String(row.fingerprint) : '';
  if (row.user_id) return `user:${row.user_id}`;
  if (fingerprint && fpToUser.has(fingerprint)) return `user:${fpToUser.get(fingerprint)}`;
  if (fingerprint) return `guest:${fingerprint}`;
  return `guest_session:${fallback}`;
}

async function main() {
  console.log('[analytics-fix] Loading sessions/logs...');
  const [sessions, logs] = await Promise.all([
    fetchAll(
      'session_logs',
      'id,session_id,user_id,fingerprint,is_admin,session_start,duration_seconds,page_views,user_agent',
      'session_start'
    ),
    fetchAll(
      'site_analytics_logs',
      'id,session_id,user_id,fingerprint,is_admin,created_at,page_url,route,landing_page,user_agent',
      'created_at'
    ),
  ]);

  console.log(`[analytics-fix] sessions=${sessions.length}, activityLogs=${logs.length}`);

  const { error: capError } = await supabase
    .from('session_logs')
    .update({ duration_seconds: SESSION_DURATION_CAP_SECONDS, updated_at: new Date().toISOString() })
    .gt('duration_seconds', SESSION_DURATION_CAP_SECONDS);
  if (capError) throw capError;

  const pageViewsBySession = new Map();
  logs.forEach((log) => {
    if (!log.session_id) return;
    const page = log.page_url || log.route || log.landing_page || '';
    const pages = pageViewsBySession.get(log.session_id) || new Set();
    if (page) pages.add(page);
    pageViewsBySession.set(log.session_id, pages);
  });

  const pageViewGroups = new Map();
  sessions.forEach((session) => {
    const inferred = Math.max(1, pageViewsBySession.get(session.session_id)?.size || 0);
    const current = Number(session.page_views || 0);
    const corrected = Math.max(current, inferred);
    if (corrected === current && current >= 1) return;
    const ids = pageViewGroups.get(corrected) || [];
    ids.push(session.id);
    pageViewGroups.set(corrected, ids);
  });

  let pageViewUpdates = 0;
  for (const [pageViews, ids] of pageViewGroups.entries()) {
    for (const idChunk of chunk(ids, 100)) {
      const { error } = await supabase
        .from('session_logs')
        .update({ page_views: pageViews, updated_at: new Date().toISOString() })
        .in('id', idChunk);
      if (error) throw error;
      pageViewUpdates += idChunk.length;
    }
  }

  const validSessions = sessions.filter(isValidRow);
  const validLogs = logs.filter(isValidRow);
  const fpToUser = new Map();
  [...validSessions, ...validLogs].forEach((row) => {
    if (row.fingerprint && row.user_id) fpToUser.set(String(row.fingerprint), String(row.user_id));
  });

  const daily = new Map();
  const addDaily = (date, visitorKey) => {
    const bucket = daily.get(date) || { login: new Set(), guest: new Set() };
    if (visitorKey.startsWith('user:')) bucket.login.add(visitorKey);
    else bucket.guest.add(visitorKey);
    daily.set(date, bucket);
  };

  validSessions.forEach((session) => {
    if (!session.session_start) return;
    addDaily(
      getKRDateString(new Date(session.session_start)),
      getVisitorKey(session, fpToUser, session.session_id || session.id)
    );
  });

  validLogs.forEach((log) => {
    if (!log.created_at) return;
    addDaily(
      getKRDateString(new Date(log.created_at)),
      getVisitorKey(log, fpToUser, log.session_id || log.id)
    );
  });

  const snapshotRows = Array.from(daily.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      logged_in_count: bucket.login.size,
      anonymous_count: bucket.guest.size,
      total_count: bucket.login.size + bucket.guest.size,
      admin_count: 0,
      snapshot_time: new Date(`${date}T12:00:00+09:00`).toISOString(),
    }));

  const { error: deleteSnapshotError } = await supabase
    .from('site_usage_stats')
    .delete()
    .not('id', 'is', null);
  if (deleteSnapshotError) throw deleteSnapshotError;

  for (const rowChunk of chunk(snapshotRows, 500)) {
    const { error } = await supabase.from('site_usage_stats').insert(rowChunk);
    if (error) throw error;
  }

  console.log('[analytics-fix] Complete');
  console.log(JSON.stringify({
    cappedDurations: sessions.filter((s) => Number(s.duration_seconds || 0) > SESSION_DURATION_CAP_SECONDS).length,
    pageViewUpdates,
    rebuiltSnapshots: snapshotRows.length,
    firstSnapshot: snapshotRows[0]?.snapshot_time || null,
    lastSnapshot: snapshotRows.at(-1)?.snapshot_time || null,
  }, null, 2));
}

main().catch((error) => {
  console.error('[analytics-fix] Failed:', error);
  process.exit(1);
});
