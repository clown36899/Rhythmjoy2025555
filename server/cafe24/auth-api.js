import crypto from 'node:crypto';
import { getMysqlPool } from './mysql-pool.js';

const SESSION_COOKIE = 'swingenjoy_session';
const GOOGLE_OAUTH_NONCE_COOKIE = 'swingenjoy_google_oauth_nonce';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const SESSION_USER_CACHE_MS = Number(process.env.SESSION_USER_CACHE_MS || 30000);
const ADMIN_ROWS_CACHE_MS = Number(process.env.ADMIN_ROWS_CACHE_MS || 30000);
const sessionUserCache = new Map();
const sessionUserLoads = new Map();
let boardAdminRowsCache = null;

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

function getCachedSessionUser(sessionId) {
  const cached = sessionUserCache.get(sessionId);
  if (!cached || cached.expiresAt <= Date.now()) {
    sessionUserCache.delete(sessionId);
    return null;
  }
  return cached.user;
}

function setCachedSessionUser(sessionId, user) {
  if (!user) {
    sessionUserCache.delete(sessionId);
    return;
  }
  sessionUserCache.set(sessionId, {
    user,
    expiresAt: Date.now() + Math.max(1000, SESSION_USER_CACHE_MS),
  });
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
    return;
  }

  res.setHeader('Set-Cookie', [existing, cookieValue]);
}

function isSecureRequest(req) {
  const forwardedProto = req?.headers?.['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return req?.secure || String(proto || '').split(',')[0] === 'https' || process.env.NODE_ENV === 'production';
}

function cookieSecuritySuffix(req) {
  return isSecureRequest(req) ? '; Secure' : '';
}

function setSessionCookie(req, res, sessionId, expiresAt) {
  appendSetCookie(
    res,
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${cookieSecuritySuffix(req)}`,
  );
}

function sessionDays() {
  return Math.max(1, Math.floor(SESSION_DAYS));
}

function sessionExpiresAt() {
  return new Date(Date.now() + sessionDays() * 24 * 60 * 60 * 1000);
}

function clearSessionCookie(req, res) {
  appendSetCookie(
    res,
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${cookieSecuritySuffix(req)}`,
  );
}

function setGoogleNonceCookie(req, res, nonce) {
  appendSetCookie(
    res,
    `${GOOGLE_OAUTH_NONCE_COOKIE}=${encodeURIComponent(nonce)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${cookieSecuritySuffix(req)}`,
  );
}

function clearGoogleNonceCookie(req, res) {
  appendSetCookie(
    res,
    `${GOOGLE_OAUTH_NONCE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${cookieSecuritySuffix(req)}`,
  );
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeLikePattern(value) {
  return String(value || '').replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function loadLegacyBoardUserIdentity(pool, row) {
  const email = normalizeEmail(row?.email);
  if (!email) return { legacy_user_ids: [] };

  const [records] = await pool.execute(
    "SELECT data_json FROM generic_records WHERE table_name = 'board_users' AND data_json LIKE ? ESCAPE '\\\\' LIMIT 20",
    [`%${escapeLikePattern(email)}%`],
  );

  const matches = records
    .map((record) => parseJson(record.data_json, null))
    .filter((profile) => normalizeEmail(profile?.email) === email);
  const legacyUserIds = Array.from(new Set(
    matches
      .map((profile) => profile?.user_id)
      .filter((userId) => userId && String(userId) !== String(row.id))
      .map(String),
  ));
  const profileMatch = matches.find((profile) => profile?.profile_image) || matches[0] || null;

  return {
    legacy_user_ids: legacyUserIds,
    legacy_profile_image: profileMatch?.profile_image || null,
    legacy_nickname: profileMatch?.nickname || null,
  };
}

async function attachLegacyBoardUserIdentity(pool, row) {
  if (!row) return null;

  const legacy = await loadLegacyBoardUserIdentity(pool, row);
  const updates = {};

  if (!row.profile_image && legacy.legacy_profile_image) {
    updates.profile_image = legacy.legacy_profile_image;
  }

  if ((!row.nickname || /^Kakao\s+\d+$/i.test(String(row.nickname))) && legacy.legacy_nickname) {
    updates.nickname = legacy.legacy_nickname;
  }

  if (Object.keys(updates).length) {
    const assignments = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
    await pool.execute(
      `UPDATE users SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...Object.values(updates), row.id],
    );
  }

  return {
    ...row,
    ...updates,
    legacy_user_ids: legacy.legacy_user_ids,
  };
}

function isConfiguredAdminEmail(email) {
  const target = normalizeEmail(email);
  if (!target) return false;
  return String(`${process.env.VITE_ADMIN_EMAIL || ''},${process.env.ADMIN_EMAIL || ''}`)
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(target);
}

async function resolveAdminFlag(pool, row) {
  if (!row) return false;
  if (Boolean(row.is_admin)) return true;
  if (isConfiguredAdminEmail(row.email)) return true;

  try {
    const now = Date.now();
    if (!boardAdminRowsCache || boardAdminRowsCache.expiresAt <= now) {
      const [adminRows] = await pool.execute(
        "SELECT data_json FROM generic_records WHERE table_name = 'board_admins'",
      );
      boardAdminRowsCache = {
        rows: adminRows,
        expiresAt: now + Math.max(1000, ADMIN_ROWS_CACHE_MS),
      };
    }

    const adminRows = boardAdminRowsCache.rows;
    const userIds = new Set([
      String(row.id || ''),
      ...(Array.isArray(row.legacy_user_ids) ? row.legacy_user_ids.map(String) : []),
    ].filter(Boolean));
    const email = normalizeEmail(row.email);
    return adminRows.some((adminRow) => {
      const admin = parseJson(adminRow.data_json, {});
      return (admin.user_id && userIds.has(String(admin.user_id)))
        || (email && normalizeEmail(admin.email || admin.admin_email) === email);
    });
  } catch {
    return false;
  }
}

async function attachSessionUserFlag(pool, row) {
  if (!row) return null;
  const [isAdmin, boardProfile] = await Promise.all([
    resolveAdminFlag(pool, row),
    loadBoardUserProfile(pool, row.id),
  ]);
  if (isAdmin && !row.is_admin) {
    pool.execute('UPDATE users SET is_admin = 1 WHERE id = ? AND is_admin = 0', [row.id]).catch(() => {});
  }
  return { ...row, board_profile: boardProfile, is_admin: isAdmin ? 1 : 0, legacy_user_ids: [] };
}

async function attachAdminFlag(pool, row) {
  if (!row) return null;
  const withLegacyIdentity = await attachLegacyBoardUserIdentity(pool, row);
  const isAdmin = await resolveAdminFlag(pool, withLegacyIdentity);
  if (isAdmin && !withLegacyIdentity.is_admin) {
    await pool.execute('UPDATE users SET is_admin = 1 WHERE id = ? AND is_admin = 0', [withLegacyIdentity.id]).catch(() => {});
  }
  return { ...withLegacyIdentity, is_admin: isAdmin ? 1 : 0 };
}

async function loadBoardUserProfile(pool, userId) {
  if (!userId) return null;
  try {
    const [records] = await pool.execute(
      `SELECT data_json
         FROM generic_records
        WHERE table_name = 'board_users'
          AND record_id = ?
        LIMIT 1`,
      [String(userId)],
    );
    const profile = parseJson(records?.[0]?.data_json, null);
    return String(profile?.user_id || '') === String(userId) ? profile : null;
  } catch {
    return null;
  }
}

function rowToUser(row) {
  if (!row) return null;
  const profile = row.board_profile || {};
  const nickname = profile.nickname || row.nickname;
  const profileImage = profile.profile_image || row.profile_image;
  return {
    id: row.id,
    email: row.email,
    user_metadata: {
      name: nickname,
      full_name: nickname,
      avatar_url: profileImage,
      picture: profileImage,
      provider: row.provider,
    },
    app_metadata: {
      provider: row.provider,
      is_admin: Boolean(row.is_admin),
    },
  };
}

function publicUser(row) {
  if (!row) return null;
  const profile = row.board_profile || {};
  return {
    id: row.id,
    email: row.email,
    nickname: profile.nickname || row.nickname,
    profile_image: profile.profile_image || row.profile_image,
    provider: row.provider,
    headline: profile.headline || null,
    profile_badge: profile.profile_badge || null,
    profile_theme: profile.profile_theme || null,
    bio: profile.bio || null,
    region: profile.region || null,
    dance_genres: profile.dance_genres || null,
    social_links: profile.social_links || null,
    primary_social: profile.primary_social || null,
    is_admin: Boolean(row.is_admin),
  };
}

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function syncBoardUserProfile(pool, row) {
  if (!row?.id) return;

  const userId = String(row.id);
  const [records] = await pool.execute(
    `SELECT record_id, data_json
       FROM generic_records
      WHERE table_name = 'board_users'
        AND (record_id = ? OR data_json LIKE ? ESCAPE '\\\\')
      LIMIT 20`,
    [userId, `%${escapeLikePattern(userId)}%`],
  );

  const matched = records
    .map((record) => ({
      recordId: record.record_id,
      data: parseJson(record.data_json, null),
    }))
    .find((record) => String(record.data?.user_id || '') === userId);

  const existing = matched?.data || {};
  const now = new Date().toISOString();
  const isWithdrawn = existing.status === 'deleted' || existing.nickname === '탈퇴한 사용자';
  const next = {
    ...existing,
    user_id: userId,
    email: row.email || existing.email || null,
    provider: row.provider || existing.provider || 'email',
    nickname: isWithdrawn
      ? row.nickname || existing.nickname || row.email?.split('@')[0] || 'User'
      : existing.nickname || row.nickname || row.email?.split('@')[0] || 'User',
    profile_image: existing.profile_image || row.profile_image || null,
    status: isWithdrawn ? 'active' : existing.status,
    deleted_at: isWithdrawn ? null : existing.deleted_at,
    created_at: existing.created_at || now,
    updated_at: now,
  };

  await pool.execute(
    `INSERT INTO generic_records (table_name, record_id, data_json, created_at, updated_at)
     VALUES ('board_users', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       data_json = VALUES(data_json),
       updated_at = VALUES(updated_at),
       imported_at = CURRENT_TIMESTAMP`,
    [
      matched?.recordId || userId,
      JSON.stringify(next),
      toMysqlDateTime(next.created_at),
      toMysqlDateTime(next.updated_at),
    ],
  );
}

function getRequestOrigin(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
    || req.protocol
    || 'http';

  return `${String(protocol).split(',')[0]}://${host}`;
}

function isLocalDevRequest(req) {
  if (process.env.NODE_ENV === 'production') return false;
  const host = String(req.headers.host || '').split(':')[0];
  return ['localhost', '127.0.0.1', '::1'].includes(host);
}

function normalizeReturnUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  if (value.length > 1200 || /[\r\n]/.test(value)) {
    return '/';
  }

  return value;
}

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
}

function getGoogleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

function hasGoogleConfig() {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

function getGoogleRedirectUri(req) {
  return `${getRequestOrigin(req)}/api/auth/google/callback`;
}

function encodeGoogleState(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeGoogleState(state) {
  if (typeof state !== 'string' || !state) return null;

  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function getGoogleStateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET
    || process.env.SESSION_SECRET
    || getGoogleClientSecret();
}

function signGoogleStatePayload(payload) {
  const secret = getGoogleStateSecret();
  if (!secret) return '';

  return crypto
    .createHmac('sha256', secret)
    .update(`${payload?.nonce || ''}\n${payload?.returnUrl || ''}\n${payload?.ts || ''}`)
    .digest('base64url');
}

function hasValidGoogleStateSignature(payload) {
  if (!payload?.sig || typeof payload.sig !== 'string') return false;

  const expected = signGoogleStatePayload(payload);
  if (!expected) return false;

  const actualBuffer = Buffer.from(payload.sig);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function fetchKakaoToken(code, redirectUri) {
  const restApiKey = process.env.VITE_KAKAO_REST_API_KEY;
  if (!restApiKey) {
    const error = new Error('Kakao REST API key is not configured');
    error.statusCode = 503;
    throw error;
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restApiKey,
    redirect_uri: redirectUri,
    code,
  });

  if (process.env.KAKAO_CLIENT_SECRET) {
    params.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  }

  const response = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Kakao token exchange failed: ${payload.error_description || payload.error || response.status}`);
  }

  return payload.access_token;
}

async function fetchKakaoProfile(accessToken) {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Kakao profile failed: ${payload.msg || payload.error || response.status}`);
  }

  const account = payload.kakao_account || {};
  const profile = account.profile || {};
  const properties = payload.properties || {};

  return {
    provider: 'kakao',
    providerUserId: String(payload.id),
    email: account.email || null,
    nickname: properties.nickname || profile.nickname || account.name || `Kakao ${payload.id}`,
    profileImage: properties.profile_image || profile.profile_image_url || null,
  };
}

async function fetchGoogleToken(code, redirectUri) {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    const error = new Error('Google OAuth is not configured');
    error.statusCode = 503;
    throw error;
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${payload.error_description || payload.error || response.status}`);
  }

  return payload.access_token;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Google profile failed: ${payload.error_description || payload.error || response.status}`);
  }

  if (!payload.sub) {
    throw new Error('Google profile did not include a stable user id');
  }

  return {
    provider: 'google',
    providerUserId: String(payload.sub),
    email: payload.email || null,
    nickname: payload.name || payload.given_name || payload.email?.split('@')[0] || `Google ${payload.sub}`,
    profileImage: payload.picture || null,
  };
}

async function upsertUser(profile) {
  const pool = getMysqlPool();
  const isAdmin = isConfiguredAdminEmail(profile.email);
  const userId = crypto.randomUUID();

  await pool.execute(
    `INSERT INTO users (
       id, provider, provider_user_id, email, nickname, profile_image, is_admin
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       email = VALUES(email),
       nickname = VALUES(nickname),
       profile_image = VALUES(profile_image),
       is_admin = IF(is_admin = 1, 1, VALUES(is_admin)),
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      profile.provider,
      profile.providerUserId,
      profile.email,
      profile.nickname,
      profile.profileImage,
      isAdmin ? 1 : 0,
    ],
  );

  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE provider = ? AND provider_user_id = ? LIMIT 1',
    [profile.provider, profile.providerUserId],
  );

  return attachAdminFlag(pool, rows[0]);
}

async function createSession(userId) {
  const pool = getMysqlPool();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = sessionExpiresAt();

  await pool.execute(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${sessionDays()} DAY))`,
    [sessionId, userId],
  );

  return { sessionId, expiresAt };
}

async function refreshSessionExpiry(req, res) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return;

  const pool = getMysqlPool();
  const expiresAt = sessionExpiresAt();
  const [result] = await pool.execute(
    `UPDATE sessions
        SET expires_at = DATE_ADD(NOW(), INTERVAL ${sessionDays()} DAY),
            last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ? AND expires_at > NOW()`,
    [sessionId],
  );

  if (result?.affectedRows) {
    setSessionCookie(req, res, sessionId, expiresAt);
  }
}

export async function getCurrentUser(req) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return null;

  const cachedUser = getCachedSessionUser(sessionId);
  if (cachedUser) return cachedUser;

  if (sessionUserLoads.has(sessionId)) {
    return sessionUserLoads.get(sessionId);
  }

  const loadUser = (async () => {
    const pool = getMysqlPool();
    const [rows] = await pool.execute(
      `SELECT u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > NOW()
        LIMIT 1`,
      [sessionId],
    );

    if (!rows[0]) {
      setCachedSessionUser(sessionId, null);
      return null;
    }

    pool.execute('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]).catch(() => {});
    const user = await attachSessionUserFlag(pool, rows[0]);
    setCachedSessionUser(sessionId, user);
    return user;
  })();

  sessionUserLoads.set(sessionId, loadUser);

  try {
    return await loadUser;
  } finally {
    sessionUserLoads.delete(sessionId);
  }
}

export async function requireAdmin(req) {
  const user = await getCurrentUser(req);
  if (!user) {
    const error = new Error('로그인이 필요합니다.');
    error.statusCode = 401;
    throw error;
  }

  if (!user.is_admin) {
    const error = new Error('관리자 권한이 필요합니다.');
    error.statusCode = 403;
    throw error;
  }

  return user;
}

export async function kakaoLogin(req, res) {
  const { code, redirectUri, kakaoAccessToken } = req.body || {};
  if (!kakaoAccessToken && (!code || !redirectUri)) {
    res.status(400).json({ error: 'Kakao authorization code is required' });
    return;
  }

  const accessToken = kakaoAccessToken || await fetchKakaoToken(code, redirectUri);
  const profile = await fetchKakaoProfile(accessToken);
  const userRow = await upsertUser(profile);
  await syncBoardUserProfile(getMysqlPool(), userRow).catch(() => {});
  const { sessionId, expiresAt } = await createSession(userRow.id);

  setSessionCookie(req, res, sessionId, expiresAt);
  res.json({
    ok: true,
    user: publicUser(userRow),
    cafe24Session: true,
  });
}

export async function devLogin(req, res) {
  if (!isLocalDevRequest(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const userId = String(req.body?.userId || 'local-admin-user').trim();
  const pool = getMysqlPool();
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  const userRow = await attachAdminFlag(pool, rows[0]);

  if (!userRow) {
    res.status(404).json({ error: 'Local dev user not found' });
    return;
  }

  const { sessionId, expiresAt } = await createSession(userRow.id);
  await syncBoardUserProfile(pool, userRow).catch(() => {});
  setSessionCookie(req, res, sessionId, expiresAt);
  res.json({
    ok: true,
    user: publicUser(userRow),
    cafe24Session: true,
    devLogin: true,
  });
}

export async function authProviders(_req, res) {
  res.json({
    kakao: Boolean(process.env.VITE_KAKAO_REST_API_KEY),
    google: hasGoogleConfig(),
  });
}

export async function googleLoginStart(req, res) {
  if (!hasGoogleConfig()) {
    res.status(503).type('text/plain').send('Google OAuth is not configured on this Cafe24 server.');
    return;
  }

  const returnUrl = normalizeReturnUrl(req.query?.returnUrl);
  const nonce = crypto.randomBytes(24).toString('base64url');
  const statePayload = {
    nonce,
    returnUrl,
    ts: Date.now(),
  };
  const state = encodeGoogleState({
    ...statePayload,
    sig: signGoogleStatePayload(statePayload),
  });
  const redirectUri = getGoogleRedirectUri(req);
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  setGoogleNonceCookie(req, res, nonce);
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function googleLoginCallback(req, res) {
  const state = decodeGoogleState(req.query?.state);
  const returnUrl = normalizeReturnUrl(state?.returnUrl);
  const cookies = parseCookies(req);
  const expectedNonce = cookies[GOOGLE_OAUTH_NONCE_COOKIE];
  const signedStateValid = hasValidGoogleStateSignature(state);

  try {
    if (req.query?.error) {
      clearGoogleNonceCookie(req, res);
      res.redirect(returnUrl);
      return;
    }

    if (!state?.nonce || (!signedStateValid && (!expectedNonce || state.nonce !== expectedNonce))) {
      clearGoogleNonceCookie(req, res);
      res.status(400).type('text/plain').send('Invalid Google login state.');
      return;
    }

    if (!state.ts || Date.now() - Number(state.ts) > 10 * 60 * 1000) {
      clearGoogleNonceCookie(req, res);
      res.status(400).type('text/plain').send('Google login request expired.');
      return;
    }

    const code = req.query?.code;
    if (typeof code !== 'string' || !code) {
      clearGoogleNonceCookie(req, res);
      res.status(400).type('text/plain').send('Google authorization code is required.');
      return;
    }

    const accessToken = await fetchGoogleToken(code, getGoogleRedirectUri(req));
    const profile = await fetchGoogleProfile(accessToken);
    const userRow = await upsertUser(profile);
    await syncBoardUserProfile(getMysqlPool(), userRow).catch(() => {});
    const { sessionId, expiresAt } = await createSession(userRow.id);

    clearGoogleNonceCookie(req, res);
    setSessionCookie(req, res, sessionId, expiresAt);
    res.redirect(returnUrl);
  } catch (error) {
    clearGoogleNonceCookie(req, res);
    throw error;
  }
}

export async function me(req, res) {
  const userRow = await getCurrentUser(req);
  res.json({
    user: rowToUser(userRow),
    profile: publicUser(userRow),
    isAdmin: Boolean(userRow?.is_admin),
  });
}

export async function logout(req, res) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (sessionId) {
    const pool = getMysqlPool();
    await pool.execute('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
}
