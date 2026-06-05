import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import nodeCrypto from 'crypto';

type KakaoProfile = {
  kakaoId: string;
  email?: string;
  nickname?: string;
  profileImage?: string | null;
  realName?: string | null;
  phoneNumber?: string | null;
};

type ExistingKakaoUser = {
  userId: string;
  email?: string;
  nickname?: string;
  profileImage?: string | null;
};

const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY || '';
const KAKAO_USER_INFO_TIMEOUT_MS = 4500;

const supabaseAdmins = new Map<string, any>();

function isLocalHost(value?: string | null) {
  if (!value) return false;
  return /(^|\/\/|\.)localhost(?::|\/|$)|(^|\/\/)127\.0\.0\.1(?::|\/|$)|(^|\/\/)0\.0\.0\.0(?::|\/|$)/i.test(value);
}

function isLocalCallback(event: Parameters<Handler>[0], redirectUri?: string) {
  if (process.env.VITE_FORCE_PROD_SUPABASE === 'true') return false;
  const host = event.headers.host || event.headers.Host || '';
  const origin = event.headers.origin || event.headers.Origin || '';
  const referer = event.headers.referer || event.headers.Referer || '';
  return [host, origin, referer, redirectUri].some((value) => isLocalHost(String(value || '')));
}

function getSupabaseConfig(event: Parameters<Handler>[0], redirectUri?: string) {
  if (isLocalCallback(event, redirectUri)) {
    return {
      supabaseUrl: LOCAL_SUPABASE_URL,
      supabaseServiceKey: LOCAL_SUPABASE_SERVICE_KEY,
    };
  }

  return {
    supabaseUrl: process.env.VITE_PUBLIC_SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  };
}

function getSupabaseAdminClient(supabaseUrl: string, supabaseServiceKey: string) {
  const cacheKey = `${supabaseUrl}:${supabaseServiceKey.slice(0, 12)}`;
  const cached = supabaseAdmins.get(cacheKey);
  if (cached) return cached;

  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  supabaseAdmins.set(cacheKey, client);
  return client;
}

function fallbackEmail(kakaoId: string) {
  return `kakao_${kakaoId}@swingenjoy.com`;
}

function normalizePhoneNumber(phoneNumber?: string | null) {
  if (!phoneNumber) return null;
  return phoneNumber.replace('+82 ', '0').replace(/-/g, '').trim() || null;
}

function compactObject<T extends object>(value: T): T {
  const record = value as Record<string, unknown>;
  Object.keys(record).forEach((key) => {
    if (record[key] === undefined) delete record[key];
  });
  return value;
}

function decodeKakaoIdToken(idToken?: string): KakaoProfile | null {
  if (!idToken) return null;

  try {
    const payloadBase64 = idToken.split('.')[1];
    const payloadDecoded = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadDecoded);
    if (!payload.sub) return null;

    return compactObject({
      kakaoId: String(payload.sub),
      email: payload.email || undefined,
      nickname: payload.nickname || undefined,
      profileImage: payload.picture || null,
      realName: null,
      phoneNumber: null,
    });
  } catch (error) {
    console.warn('[kakao-login] Failed to decode Kakao ID token:', error);
    return null;
  }
}

function profileFromKakaoUser(userData: any, base: Partial<KakaoProfile> = {}): KakaoProfile {
  const kakaoId = String(userData?.id || base.kakaoId || '');
  const kakaoAccount = userData?.kakao_account || {};
  const properties = userData?.properties || {};

  return compactObject({
    kakaoId,
    email: kakaoAccount.email || base.email || undefined,
    nickname: properties.nickname || kakaoAccount.profile?.nickname || base.nickname || `User${kakaoId}`,
    profileImage: properties.profile_image || kakaoAccount.profile?.profile_image_url || base.profileImage || null,
    realName: kakaoAccount.name || base.realName || null,
    phoneNumber: normalizePhoneNumber(kakaoAccount.phone_number) || base.phoneNumber || null,
  });
}

async function fetchKakaoUserProfile(accessToken: string, base: Partial<KakaoProfile> = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KAKAO_USER_INFO_TIMEOUT_MS);

  try {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      signal: controller.signal,
    });
    const userData = await response.json();

    if (!response.ok) {
      throw new Error(`Kakao user info failed: ${JSON.stringify(userData)}`);
    }

    return profileFromKakaoUser(userData, base);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function findExistingKakaoUser(supabaseAdmin: any, kakaoId: string): Promise<ExistingKakaoUser | null> {
  const { data: rpcData, error: rpcError } = await supabaseAdmin
    .rpc('get_kakao_user_info', { p_kakao_id: kakaoId })
    .maybeSingle();

  if (rpcData?.user_id) {
    return {
      userId: rpcData.user_id,
      email: rpcData.email || undefined,
      nickname: rpcData.nickname || undefined,
      profileImage: rpcData.profile_image || null,
    };
  }

  if (rpcError) {
    console.warn('[kakao-login] Kakao lookup RPC failed, falling back to board_users:', rpcError.message);
  }

  const { data: boardUser } = await supabaseAdmin
    .from('board_users')
    .select('user_id, email, nickname, profile_image')
    .eq('kakao_id', kakaoId)
    .maybeSingle();

  if (!boardUser?.user_id) return null;

  let email = boardUser.email || undefined;
  if (!email) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(boardUser.user_id);
    email = authUser?.user?.email || undefined;
  }

  return {
    userId: boardUser.user_id,
    email,
    nickname: boardUser.nickname || undefined,
    profileImage: boardUser.profile_image || null,
  };
}

async function createOrFindAuthUser(supabaseAdmin: any, profile: KakaoProfile) {
  const email = profile.email || fallbackEmail(profile.kakaoId);
  const nickname = profile.nickname || `User${profile.kakaoId}`;
  const randomPassword = nodeCrypto.randomBytes(16).toString('hex');

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: randomPassword,
    email_confirm: true,
    user_metadata: {
      name: nickname,
      full_name: profile.realName || nickname,
      real_name: profile.realName || null,
      phone_number: profile.phoneNumber || null,
      kakao_id: profile.kakaoId,
      provider: 'kakao',
    },
  });

  if (!createError && newUser?.user) {
    return { userId: newUser.user.id, email };
  }

  if (createError && !createError.message?.toLowerCase().includes('registered') && (createError as any).status !== 422) {
    throw createError;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserByEmail(email);
  if (userData?.user) {
    return { userId: userData.user.id, email: userData.user.email || email };
  }

  throw createError || new Error('Could not create or locate Supabase user');
}

async function generateSession(supabaseAdmin: any, email: string) {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.action_link) {
    throw linkError || new Error('Link generation failed');
  }

  const tokenHash = new URL(linkData.properties.action_link).searchParams.get('token');
  if (!tokenHash) throw new Error('Token hash not found');

  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (sessionError || !sessionData.session) {
    throw sessionError || new Error('Session verification failed');
  }

  return sessionData.session;
}

async function syncKakaoProfile(
  supabaseAdmin: any,
  userId: string,
  accessToken: string,
  baseProfile: KakaoProfile,
  isNewUser: boolean,
) {
  let profile = baseProfile;

  try {
    profile = await fetchKakaoUserProfile(accessToken, baseProfile);
  } catch (error) {
    console.warn('[kakao-login] Background Kakao profile sync skipped:', error);
  }

  if (!profile.kakaoId) return;

  const nickname = profile.nickname || `User${profile.kakaoId}`;
  const email = profile.email || fallbackEmail(profile.kakaoId);

  const authUpdate = supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      name: nickname,
      full_name: profile.realName || nickname,
      real_name: profile.realName || null,
      phone_number: profile.phoneNumber || null,
      kakao_id: profile.kakaoId,
      provider: 'kakao',
    },
  });

  const updateData: Record<string, unknown> = {
    user_id: userId,
    kakao_id: profile.kakaoId,
    nickname,
    real_name: profile.realName || null,
    phone_number: profile.phoneNumber || null,
    email,
    provider: 'kakao',
    updated_at: new Date().toISOString(),
  };

  if (isNewUser && profile.profileImage) {
    updateData.profile_image = profile.profileImage;
  }

  const boardUserUpsert = supabaseAdmin
    .from('board_users')
    .upsert(compactObject(updateData), { onConflict: 'user_id' });

  const [authResult, boardUserResult] = await Promise.allSettled([authUpdate, boardUserUpsert]);

  if (authResult.status === 'rejected') {
    console.warn('[kakao-login] Auth metadata sync failed:', authResult.reason);
  }

  if (boardUserResult.status === 'fulfilled' && boardUserResult.value?.error) {
    console.warn('[kakao-login] board_users sync failed:', boardUserResult.value.error);
  } else if (boardUserResult.status === 'rejected') {
    console.warn('[kakao-login] board_users sync failed:', boardUserResult.reason);
  }
}

function runAfterResponse(context: any, promise: Promise<unknown>, label: string) {
  const guardedPromise = promise.catch((error) => {
    console.warn(`[kakao-login] ${label} failed:`, error);
  });

  if (typeof context?.waitUntil === 'function') {
    context.waitUntil(guardedPromise);
  }
}

export const handler: Handler = async (event, context: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const restApiKey = process.env.VITE_KAKAO_REST_API_KEY || process.env.KAKAO_REST_API_KEY;
  const adminEmail = process.env.VITE_ADMIN_EMAIL;
  const startedAt = performance.now();
  const timings: Record<string, number> = {};

  if (!restApiKey) {
    console.error('[kakao-login] Missing KAKAO_REST_API_KEY');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { code, redirectUri } = body;

    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing authorization code' }) };
    }

    const { supabaseUrl, supabaseServiceKey } = getSupabaseConfig(event, redirectUri);
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[kakao-login] Missing Supabase environment variables', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      });
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const supabaseAdmin = getSupabaseAdminClient(supabaseUrl, supabaseServiceKey);

    const tokenStartedAt = performance.now();
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: restApiKey,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });
    timings.kakaoTokenMs = Math.round(performance.now() - tokenStartedAt);

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('[kakao-login] Token exchange failed:', tokenData);
      return { statusCode: 401, body: JSON.stringify({ error: 'Failed to exchange authorization code', details: tokenData }) };
    }

    const { access_token: kakaoAccessToken, id_token: kakaoIdToken } = tokenData;
    let profile = decodeKakaoIdToken(kakaoIdToken) || { kakaoId: '' };
    let usedSynchronousUserInfo = false;

    if (!profile.kakaoId) {
      const userInfoStartedAt = performance.now();
      profile = await fetchKakaoUserProfile(kakaoAccessToken, profile);
      timings.kakaoUserInfoMs = Math.round(performance.now() - userInfoStartedAt);
      usedSynchronousUserInfo = true;
    }

    if (!profile.kakaoId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Kakao user id not found' }) };
    }

    const lookupStartedAt = performance.now();
    const existingUser = await findExistingKakaoUser(supabaseAdmin, profile.kakaoId);
    timings.userLookupMs = Math.round(performance.now() - lookupStartedAt);

    let userId = existingUser?.userId;
    profile = compactObject({
      ...profile,
      email: existingUser?.email || profile.email || undefined,
      nickname: profile.nickname || existingUser?.nickname || `User${profile.kakaoId}`,
      profileImage: profile.profileImage || existingUser?.profileImage || null,
    });

    const isNewUser = !userId;

    if (isNewUser && !usedSynchronousUserInfo) {
      const userInfoStartedAt = performance.now();
      try {
        profile = await fetchKakaoUserProfile(kakaoAccessToken, profile);
        timings.kakaoUserInfoMs = Math.round(performance.now() - userInfoStartedAt);
      } catch (error) {
        if (!profile.email) throw error;
        timings.kakaoUserInfoMs = Math.round(performance.now() - userInfoStartedAt);
        console.warn('[kakao-login] New user detail fetch failed; continuing with OIDC profile:', error);
      }
    }

    profile.email = profile.email || fallbackEmail(profile.kakaoId);
    profile.nickname = profile.nickname || `User${profile.kakaoId}`;

    if (!userId) {
      const createStartedAt = performance.now();
      const createdUser = await createOrFindAuthUser(supabaseAdmin, profile);
      userId = createdUser.userId;
      profile.email = createdUser.email || profile.email;
      timings.userCreateMs = Math.round(performance.now() - createStartedAt);
    }

    if (!userId) throw new Error('Could not determine User ID');

    const sessionStartedAt = performance.now();
    const sessionPromise = generateSession(supabaseAdmin, profile.email);
    const syncPromise = syncKakaoProfile(supabaseAdmin, userId, kakaoAccessToken, profile, isNewUser);

    let session: any;
    if (isNewUser) {
      [session] = await Promise.all([sessionPromise, syncPromise]);
    } else {
      runAfterResponse(context, syncPromise, 'background profile sync');
      session = await sessionPromise;
    }

    timings.sessionMs = Math.round(performance.now() - sessionStartedAt);
    timings.totalMs = Math.round(performance.now() - startedAt);

    console.log('[kakao-login] Login complete:', {
      kakaoId: profile.kakaoId,
      userId,
      isNewUser,
      usedSynchronousUserInfo,
      timings,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        email: profile.email,
        name: profile.nickname,
        isAdmin: profile.email === adminEmail,
        session,
        timings,
      }),
    };
  } catch (err: any) {
    console.error('[kakao-login] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Kakao login failed' }) };
  }
};
