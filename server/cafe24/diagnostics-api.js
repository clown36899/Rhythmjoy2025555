import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCurrentUser, requireAdmin } from './auth-api.js';
import {
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';

const RELOAD_DIAGNOSTICS_TABLE = 'client_reload_diagnostics';
const SERVER_VERSION_DIAGNOSTICS_TABLE = 'server_version_diagnostics';
const MAX_TEXT_LENGTH = 2000;
let lastServerVersionSignature = null;

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

function truncate(value, maxLength = MAX_TEXT_LENGTH) {
  const text = asString(value);
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated ${text.length - maxLength}]` : text;
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

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function readServerVersionSnapshot() {
  const distDir = path.resolve(process.cwd(), process.env.CAFE24_DIST_DIR || 'dist');
  const versionFile = path.join(distDir, 'version.json');
  const indexFile = path.join(distDir, 'index.html');
  const serviceWorkerFile = path.join(distDir, 'service-worker.js');

  const snapshot = {
    version: null,
    version_mtime: null,
    index_mtime: null,
    service_worker_mtime: null,
  };

  try {
    const [versionText, versionStat] = await Promise.all([
      fs.readFile(versionFile, 'utf8'),
      fs.stat(versionFile),
    ]);
    snapshot.version = parseJson(versionText, null);
    snapshot.version_mtime = versionStat.mtime.toISOString();
  } catch {
    // Keep the diagnostic endpoint non-fatal; missing version.json is itself useful context.
  }

  try {
    snapshot.index_mtime = (await fs.stat(indexFile)).mtime.toISOString();
  } catch {}

  try {
    snapshot.service_worker_mtime = (await fs.stat(serviceWorkerFile)).mtime.toISOString();
  } catch {}

  return snapshot;
}

function sortNewestFirst(rows) {
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.created_at || a.client_time || 0) || 0;
    const bTime = Date.parse(b.created_at || b.client_time || 0) || 0;
    return bTime - aTime;
  });
}

function serverVersionSignature(snapshot) {
  return JSON.stringify({
    versionBuildTime: snapshot.version?.buildTime || null,
    versionDate: snapshot.version?.date || null,
    versionMtime: snapshot.version_mtime || null,
    indexMtime: snapshot.index_mtime || null,
    serviceWorkerMtime: snapshot.service_worker_mtime || null,
  });
}

async function saveServerVersionDiagnostic(phase, trigger, snapshot) {
  const now = new Date().toISOString();
  await saveCafe24TableRow(SERVER_VERSION_DIAGNOSTICS_TABLE, {
    id: crypto.randomUUID(),
    kind: 'server_version',
    phase,
    trigger,
    server_build_id: snapshot.version?.buildTime || null,
    server_version_date: snapshot.version?.date || null,
    server_version: snapshot.version,
    server_version_mtime: snapshot.version_mtime,
    server_index_mtime: snapshot.index_mtime,
    server_service_worker_mtime: snapshot.service_worker_mtime,
    created_at: now,
    updated_at: now,
  });
}

export function initServerVersionWatcher({ intervalMs = 60_000 } = {}) {
  const check = async (phase) => {
    try {
      const snapshot = await readServerVersionSnapshot();
      const signature = serverVersionSignature(snapshot);
      const shouldRecord = phase === 'server_start' || (lastServerVersionSignature && signature !== lastServerVersionSignature);
      lastServerVersionSignature = signature;

      if (shouldRecord) {
        await saveServerVersionDiagnostic(phase, 'dist-version-watch', snapshot);
      }
    } catch (error) {
      console.warn('[cafe24:diagnostics] server version watch failed:', error?.message || error);
    }
  };

  void check('server_start');
  const timer = setInterval(() => {
    void check('changed');
  }, intervalMs);
  timer.unref?.();
}

export async function recordClientReloadDiagnostic(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const requestIp = requestClientIp(req);
  const user = await getCurrentUser(req).catch(() => null);
  const now = new Date().toISOString();
  const serverSnapshot = await readServerVersionSnapshot();

  const row = {
    id: asString(body.id) || crypto.randomUUID(),
    kind: 'client_reload',
    reason: truncate(body.reason, 160) || 'unknown',
    phase: truncate(body.phase, 80) || 'unknown',
    trigger: truncate(body.trigger, 120),
    client_build_id: truncate(body.client_build_id || body.clientBuildId, 80),
    server_build_id: truncate(body.server_build_id || body.serverBuildId, 80),
    target_build_id: truncate(body.target_build_id || body.targetBuildId, 80),
    app_version: truncate(body.app_version || body.appVersion, 40),
    route: truncate(body.route || body.path || body.pathname, 255),
    page_url: truncate(body.page_url || body.href || body.url, 700),
    referrer: truncate(body.referrer, 700),
    session_id: truncate(body.session_id || body.sessionId, 140),
    fingerprint: truncate(body.fingerprint, 180),
    user_id: user?.id || asString(body.user_id || body.userId),
    user_email: user?.email || null,
    is_admin: Boolean(user?.is_admin) || asBool(body.is_admin, false),
    visibility_state: truncate(body.visibility_state || body.visibilityState, 40),
    has_focus: asBool(body.has_focus ?? body.hasFocus, false),
    online: asBool(body.online, true),
    is_pwa: asBool(body.is_pwa ?? body.isPwa, false),
    pwa_display_mode: truncate(body.pwa_display_mode || body.pwaDisplayMode, 80),
    retry_count: Number.isFinite(Number(body.retry_count ?? body.retryCount))
      ? Number(body.retry_count ?? body.retryCount)
      : null,
    message: truncate(body.message, 1200),
    stack: truncate(body.stack, 2000),
    extra: body.extra && typeof body.extra === 'object' ? body.extra : null,
    server_version: serverSnapshot.version,
    server_version_mtime: serverSnapshot.version_mtime,
    server_index_mtime: serverSnapshot.index_mtime,
    server_service_worker_mtime: serverSnapshot.service_worker_mtime,
    user_agent: truncate(body.user_agent, 700) || truncate(req.headers['user-agent'], 700),
    client_ip: requestIp,
    ip_hash: hashIp(requestIp),
    client_time: truncate(body.client_time || body.clientTime, 80),
    created_at: now,
    updated_at: now,
  };

  await saveCafe24TableRow(RELOAD_DIAGNOSTICS_TABLE, row);
  res.json({ ok: true, id: row.id });
}

export async function listClientReloadDiagnostics(req, res) {
  await requireAdmin(req);
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
  const rows = sortNewestFirst(await loadCafe24TableRows(RELOAD_DIAGNOSTICS_TABLE)).slice(0, limit);
  res.json({
    ok: true,
    table: RELOAD_DIAGNOSTICS_TABLE,
    count: rows.length,
    data: rows,
  });
}

export async function listServerVersionDiagnostics(req, res) {
  await requireAdmin(req);
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
  const rows = sortNewestFirst(await loadCafe24TableRows(SERVER_VERSION_DIAGNOSTICS_TABLE)).slice(0, limit);
  res.json({
    ok: true,
    table: SERVER_VERSION_DIAGNOSTICS_TABLE,
    count: rows.length,
    data: rows,
  });
}
