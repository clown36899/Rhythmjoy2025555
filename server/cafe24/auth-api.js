import crypto from 'node:crypto';
import { getMysqlPool } from './mysql-pool.js';

const SESSION_COOKIE = 'swingenjoy_session';
const GOOGLE_OAUTH_NONCE_COOKIE = 'swingenjoy_google_oauth_nonce';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

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

function setSessionCookie(res, sessionId, expiresAt) {
  appendSetCookie(
    res,
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`,
  );
}

function clearSessionCookie(res) {
  appendSetCookie(
    res,
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
}

function setGoogleNonceCookie(res, nonce) {
  appendSetCookie(
    res,
    `${GOOGLE_OAUTH_NONCE_COOKIE}=${encodeURIComponent(nonce)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  );
}

function clearGoogleNonceCookie(res) {
  appendSetCookie(
    res,
    `${GOOGLE_OAUTH_NONCE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
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
    const [adminRows] = await pool.execute(
      "SELECT data_json FROM generic_records WHERE table_name = 'board_admins'",
    );
    const userId = String(row.id || '');
    const email = normalizeEmail(row.email);
    return adminRows.some((adminRow) => {
      const admin = parseJson(adminRow.data_json, {});
      return (userId && String(admin.user_id || '') === userId)
        || (email && normalizeEmail(admin.email || admin.admin_email) === email);
    });
  } catch {
    return false;
  }
}

async function attachAdminFlag(pool, row) {
  if (!row) return null;
  const isAdmin = await resolveAdminFlag(pool, row);
  if (isAdmin && !row.is_admin) {
    await pool.execute('UPDATE users SET is_admin = 1 WHERE id = ? AND is_admin = 0', [row.id]).catch(() => {});
  }
  return { ...row, is_admin: isAdmin ? 1 : 0 };
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    user_metadata: {
      name: row.nickname,
      full_name: row.nickname,
      avatar_url: row.profile_image,
      picture: row.profile_image,
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
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    profile_image: row.profile_image,
    provider: row.provider,
    is_admin: Boolean(row.is_admin),
  };
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

async function fetchKakaoToken(code, redirectUri) {
  const restApiKey = process.env.VITE_KAKAO_REST_API_KEY;
  if (!restApiKey) throw new Error('Kakao REST API key is not configured');

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
  const sessionDays = Math.max(1, Math.floor(SESSION_DAYS));
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await pool.execute(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${sessionDays} DAY))`,
    [sessionId, userId],
  );

  return { sessionId, expiresAt };
}

export async function getCurrentUser(req) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return null;

  const pool = getMysqlPool();
  const [rows] = await pool.execute(
    `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > NOW()
      LIMIT 1`,
    [sessionId],
  );

  if (!rows[0]) return null;

  await pool.execute('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);
  return attachAdminFlag(pool, rows[0]);
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
  const { sessionId, expiresAt } = await createSession(userRow.id);

  setSessionCookie(res, sessionId, expiresAt);
  res.json({
    ok: true,
    user: publicUser(userRow),
    cafe24Session: true,
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
  const state = encodeGoogleState({
    nonce,
    returnUrl,
    ts: Date.now(),
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

  setGoogleNonceCookie(res, nonce);
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function googleLoginCallback(req, res) {
  const state = decodeGoogleState(req.query?.state);
  const returnUrl = normalizeReturnUrl(state?.returnUrl);
  const cookies = parseCookies(req);
  const expectedNonce = cookies[GOOGLE_OAUTH_NONCE_COOKIE];

  try {
    if (req.query?.error) {
      res.redirect(returnUrl);
      return;
    }

    if (!state?.nonce || !expectedNonce || state.nonce !== expectedNonce) {
      res.status(400).type('text/plain').send('Invalid Google login state.');
      return;
    }

    if (!state.ts || Date.now() - Number(state.ts) > 10 * 60 * 1000) {
      res.status(400).type('text/plain').send('Google login request expired.');
      return;
    }

    const code = req.query?.code;
    if (typeof code !== 'string' || !code) {
      res.status(400).type('text/plain').send('Google authorization code is required.');
      return;
    }

    const accessToken = await fetchGoogleToken(code, getGoogleRedirectUri(req));
    const profile = await fetchGoogleProfile(accessToken);
    const userRow = await upsertUser(profile);
    const { sessionId, expiresAt } = await createSession(userRow.id);

    clearGoogleNonceCookie(res);
    setSessionCookie(res, sessionId, expiresAt);
    res.redirect(returnUrl);
  } catch (error) {
    clearGoogleNonceCookie(res);
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
  clearSessionCookie(res);
  res.json({ ok: true });
}
