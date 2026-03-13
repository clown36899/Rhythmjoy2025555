import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// 전역 변수 (재사용)
let supabaseAdmin: any = null;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const adminEmail = process.env.VITE_ADMIN_EMAIL;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[kakao-login] ❌ 환경변수 누락:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey
    });
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  try {
    console.log('[kakao-login] 🚀 요청 수신');
    const body = JSON.parse(event.body || '{}');
    const { code, redirectUri } = body;

    if (!code) {
      console.error('[kakao-login] ❌ 인증 코드 누락');
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing authorization code' }) };
    }

    // 1. 인증 코드로 액세스 토큰 교환
    const restApiKey = process.env.VITE_KAKAO_REST_API_KEY || process.env.KAKAO_REST_API_KEY;
    if (!restApiKey) {
      console.error('[kakao-login] ❌ Missing KAKAO_REST_API_KEY environment variable');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key' }) };
    }

    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: restApiKey,
        redirect_uri: redirectUri,
        code: code,
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[kakao-login] ❌ 토큰 교환 실패:', errorText);
      return { statusCode: 401, body: JSON.stringify({ error: 'Failed to exchange authorization code', details: errorText }) };
    }

    const tokenData = await tokenResponse.json();
    const { access_token: kakaoAccessToken, refresh_token: kakaoRefreshToken, id_token: kakaoIdToken } = tokenData;

    // 2. 카카오 사용자 정보 조회 (OIDC 최적화 적용 및 실명/전화번호 추출)
    let kakaoId: bigint | number | string = '';
    let email: string = '';
    let nickname: string = '';
    let profileImage: string | null = null;
    let realName: string | null = null;
    let phoneNumber: string | null = null;
    let usingOIDC = false;

    // A. OIDC (ID Token) 시도
    if (kakaoIdToken) {
      try {
        const payloadBase64 = kakaoIdToken.split('.')[1];
        const payloadDecoded = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const idTokenPayload = JSON.parse(payloadDecoded);

        if (idTokenPayload.sub) {
          kakaoId = idTokenPayload.sub;
          email = idTokenPayload.email || `kakao_${kakaoId}@swingenjoy.com`;
          nickname = idTokenPayload.nickname || 'Unknown User';
          profileImage = idTokenPayload.picture || null;
          usingOIDC = true;
        }
      } catch (e) {
        console.warn('[kakao-login] ⚠️ ID Token 디코딩 실패 -> API 호출로 전환:', e);
      }
    }

    // B. 기존 API 호출 (실명 및 전화번호 조회를 위해 필수)
    console.log('[kakao-login] 2단계: 카카오 사용자 정보 조회 (API 호출)');
    const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    const kakaoUser = await kakaoUserResponse.json();

    if (kakaoUserResponse.ok) {
      kakaoId = kakaoUser.id;
      const kakaoAccount = kakaoUser.kakao_account || {};
      email = kakaoAccount.email || email;
      const properties = kakaoUser.properties || {};
      nickname = properties.nickname || kakaoAccount.profile?.nickname || nickname || `User${kakaoId}`;
      profileImage = properties.profile_image || kakaoAccount.profile?.profile_image_url || profileImage;

      // 실명 및 전화번호 추출 (카카오 설정에서 권한 허용 필요)
      realName = kakaoAccount.name || null;
      const phoneNumberRaw = kakaoAccount.phone_number || '';
      phoneNumber = phoneNumberRaw ? phoneNumberRaw.replace('+82 ', '0').replace(/-/g, '') : null;
    } else if (!usingOIDC) {
      console.error('[kakao-login] Failed to fetch user info:', kakaoUser);
      return { statusCode: 400, body: JSON.stringify({ error: 'Failed to fetch user info', details: kakaoUser }) };
    }

    if (!email) email = `kakao_${kakaoId}@swingenjoy.com`;

    // 3. Supabase 사용자 처리 (조회 또는 생성)
    const { data: existingBoardUser } = await supabaseAdmin
      .from('board_users')
      .select('user_id')
      .eq('kakao_id', kakaoId)
      .maybeSingle();

    let userId = existingBoardUser?.user_id;

    if (userId) {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authUser?.user?.email) email = authUser.user.email;
      } catch (e) {
        // 이미 가입된 경우 등 무시
      }
    }

    if (!userId) {
      // 3.1 Fallback: 이메일 기반 계정 통합 (Account Linking)
      // kakao_id로는 못 찾았지만 동일한 이메일을 가진 계정이 있는지 먼저 board_users에서 찾음
      const { data: existingUserByEmail } = await supabaseAdmin
        .from('board_users')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();

      if (existingUserByEmail?.user_id) {
        userId = existingUserByEmail.user_id;
        console.log(`[kakao-login] 🔗 Account Linked by Email: ${email} -> ${userId}`);
      } else {
        // 기존 이메일로도 가입된 내역이 없으면 완전히 새로운 Auth User 생성
        const randomPassword = crypto.randomBytes(16).toString('hex');
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword,
          email_confirm: true,
          user_metadata: {
            name: nickname,
            full_name: realName || nickname, 
            real_name: realName,
            phone_number: phoneNumber,
            kakao_id: kakaoId,
            provider: 'kakao'
          }
        });

        if (createError) {
          if (!createError.message?.toLowerCase().includes("registered") && (createError as any).status !== 422) {
            throw createError;
          }
        } else if (newUser?.user) {
          userId = newUser.user.id;
        }
      }
    }

    if (!userId) {
      // 최후의 보루: listUsers로 찾기 (위에서 registered 에러가 났을 때 등)
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const userByEmail = listData?.users.find((u: any) => u.email === email);
      if (userByEmail) {
        userId = userByEmail.id;
        console.log(`[kakao-login] 🔗 Account Linked via listUsers fallback: ${userId}`);
      }
    }

    if (!userId) throw new Error('Could not determine User ID for session');

    // [중요] 기존 사용자든 신규 사용자든, 최신 카카오 정보를 인증 메타데이터에 연동
    // 이를 통해 프론트엔드 세션(user object)에서 즉시 최신 정보를 인지할 수 있음
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          kakao_id: kakaoId,
          real_name: realName,
          phone_number: phoneNumber,
          full_name: realName || nickname,
          provider: 'kakao'
        }
      });
      console.log('[kakao-login] ✅ User metadata updated successfully');
    } catch (metaError) {
      console.error('[kakao-login] ⚠️ Failed to update user metadata:', metaError);
    }

    // 4. 병렬 처리: 프로필 갱신(DB)과 세션 생성(Auth)
    const upsertPromise = (async () => {
      try {
        const updateData: any = {
          user_id: userId,
          kakao_id: kakaoId,
          nickname: nickname,
          real_name: realName,
          phone_number: phoneNumber,
          email: email,
          provider: 'kakao',
          updated_at: new Date().toISOString()
        };

        if (!existingBoardUser && profileImage) {
          updateData.profile_image = profileImage;
        }

        await supabaseAdmin.from('board_users').upsert(updateData, { onConflict: 'user_id' });
      } catch (err) {
        console.error('[kakao-login] Exception updating board_users:', err);
      }
    })();

    const sessionPromise = (async () => {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

      if (linkError || !linkData?.properties?.action_link) throw linkError || new Error('Link generation failed');

      const tokenHash = new URL(linkData.properties.action_link).searchParams.get('token');
      if (!tokenHash) throw new Error('Token hash not found');

      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink'
      });

      if (sessionError || !sessionData.session) throw sessionError || new Error('Session verification failed');
      return sessionData.session;
    })();

    const [_, session] = await Promise.all([upsertPromise, sessionPromise]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        email,
        name: nickname,
        isAdmin: email === adminEmail,
        session: session
      })
    };

  } catch (err: any) {
    console.error('Kakao login error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
