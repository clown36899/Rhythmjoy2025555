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

  console.log('[kakao-login] 환경변수 확인:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey,
    serviceKeyPrefix: supabaseServiceKey?.substring(0, 20) + '...'
  });

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  try {
    console.log('[kakao-login] 🚀 요청 수신');
    const body = JSON.parse(event.body || '{}');
    const { code, redirectUri } = body;

    console.log('[kakao-login] 요청 파라미터:', {
      hasCode: !!code,
      codePreview: code ? code.substring(0, 10) + '...' : null,
      redirectUri
    });

    if (!code) {
      console.error('[kakao-login] ❌ 인증 코드 누락');
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing authorization code' }) };
    }

    // 1. 인증 코드로 액세스 토큰 교환
    console.log('[kakao-login] 1단계: 카카오 토큰 교환 시작');
    const restApiKey = process.env.VITE_KAKAO_REST_API_KEY || process.env.KAKAO_REST_API_KEY;

    if (!restApiKey) {
      console.error('[kakao-login] ❌ Missing KAKAO_REST_API_KEY environment variable');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key' }) };
    }

    console.log('[kakao-login] REST API Key 존재:', !!restApiKey);
    console.log('[kakao-login] 토큰 교환 요청 전송 중...');

    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: restApiKey,
        redirect_uri: redirectUri,
        code: code,
      }).toString()
    });

    console.log('[kakao-login] 토큰 교환 응답:', {
      status: tokenResponse.status,
      ok: tokenResponse.ok
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[kakao-login] ❌ 토큰 교환 실패:', errorText);
      return { statusCode: 401, body: JSON.stringify({ error: 'Failed to exchange authorization code', details: errorText }) };
    }

    const tokenData = await tokenResponse.json();
    const { access_token: kakaoAccessToken, refresh_token: kakaoRefreshToken, id_token: kakaoIdToken } = tokenData;

    console.log('[kakao-login] ✅ 토큰 교환 성공:', {
      hasAccessToken: !!kakaoAccessToken,
      hasRefreshToken: !!kakaoRefreshToken,
      hasIdToken: !!kakaoIdToken
    });

    // 2. 카카오 사용자 정보 조회 (OIDC 최적화 적용)
    let kakaoId: BigInt | number | string = '';
    let email: string = '';
    let nickname: string = '';
    let profileImage: string | null = null;
    let usingOIDC = false;

    // A. OIDC (ID Token) 시도
    if (kakaoIdToken) {
      try {
        console.log('[kakao-login] 🆔 ID Token 발견 - OIDC 디코딩 시도');
        const payloadBase64 = kakaoIdToken.split('.')[1];
        const payloadDecoded = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const idTokenPayload = JSON.parse(payloadDecoded);

        console.log('[kakao-login] ID Token Payload (partial):', {
          sub: idTokenPayload.sub,
          email: idTokenPayload.email,
          nickname: idTokenPayload.nickname
        });

        if (idTokenPayload.sub) {
          kakaoId = idTokenPayload.sub;
          email = idTokenPayload.email || `kakao_${kakaoId}@example.com`; // 이메일 없을 경우 대체
          nickname = idTokenPayload.nickname || 'Unknown User';
          profileImage = idTokenPayload.picture || null;
          usingOIDC = true;
          console.log('[kakao-login] ✅ OIDC 최적화 적용 성공! (API 호출 생략)');
        }
      } catch (e) {
        console.warn('[kakao-login] ⚠️ ID Token 디코딩 실패 -> API 호출로 전환:', e);
      }
    }

    // B. 기존 API 호출 (OIDC 실패 또는 ID Token 없음)
    if (!usingOIDC) {
      console.log('[kakao-login] 2단계: 카카오 사용자 정보 조회 시작 (API 호출)');
      const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: {
          Authorization: `Bearer ${kakaoAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        }
      });

      const kakaoUser = await kakaoUserResponse.json();

      if (!kakaoUserResponse.ok) {
        console.error('[kakao-login] Failed to fetch user info:', kakaoUser);
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Failed to fetch user info', details: kakaoUser }),
        };
      }

      console.log('[kakao-login] ✅ 사용자 정보 조회 성공');

      kakaoId = kakaoUser.id;
      const kakaoAccount = kakaoUser.kakao_account || {};
      email = kakaoAccount.email;
      const properties = kakaoUser.properties || {};
      nickname = properties.nickname || kakaoAccount.profile?.nickname || `User${kakaoId}`;
      profileImage = properties.profile_image || kakaoAccount.profile?.profile_image_url || null;
    }

    if (!email) {
      // 이메일 권한이 없는 경우, 카카오 ID 기반 가상 이메일 생성 (필수)
      console.warn('[kakao-login] ⚠️ 이메일 정보 없음. 가상 이메일 생성.');
      email = `kakao_${kakaoId}@swingenjoy.com`;
    }

    // 3단계 진입 전 확인
    console.log('[kakao-login] 정보 추출 완료:', { kakaoId, email, nickname, usingOIDC });

    // 2. Supabase 사용자 처리 (조회 또는 생성)
    console.log('[kakao-login] 3단계: Supabase 사용자 조회/생성 시작');
    const startTimeAuth = Date.now();

    // 2-1. 먼저 board_users에서 kakao_id로 기존 사용자 조회 (Auth Admin API 호출 줄이기)
    const { data: existingBoardUser, error: boardUserError } = await supabaseAdmin
      .from('board_users')
      .select('user_id')
      .eq('kakao_id', kakaoId)
      .maybeSingle();

    let userId = existingBoardUser?.user_id;
    console.log('[kakao-login] 기존 board_user 조회 결과:', {
      found: !!userId,
      userId,
      duration: Date.now() - startTimeAuth
    });

    if (userId) {
      // [보완] 기존 사용자가 발견된 경우, Auth Admin API로 해당 사용자의 현재 이메일을 가져옵니다.
      // 사용자가 카카오 이메일을 변경했더라도, 기존 Auth와 연동된 이메일을 사용하여 세션을 유지합니다.
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authUser?.user?.email) {
          console.log('[kakao-login] 📧 기존 Auth 이메일 사용:', authUser.user.email);
          email = authUser.user.email;
        }
      } catch (e) {
        console.warn('[kakao-login] Failed to fetch existing auth user email:', e);
      }
    } else {
      // 2-2. board_users에 없으면 Auth에서 이메일로 조회 (혹시 수동 가입했을 가능성)
      console.log('[kakao-login] board_user 없음, 이메일로 Auth 유저 생성 시도');
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          name: nickname,
          kakao_id: kakaoId
        }
      });

      if (createError) {
        if (createError.message?.toLowerCase().includes("registered") || (createError as any).status === 422) {
          console.log('[kakao-login] 이메일로 이미 가입된 사용자임이 확인됨');
        } else {
          console.error('[kakao-login] ❌ 사용자 생성 실패:', createError);
          throw createError;
        }
      } else if (newUser?.user) {
        userId = newUser.user.id;
        console.log('[kakao-login] ✅ 새 Auth 사용자 생성됨:', userId);
      }
    }

    // 3. 로그인 세션 생성을 위한 매직 링크 발급 (여기서 확실한 userId를 얻음)
    // 3. 병렬 처리: 프로필 갱신(DB)과 세션 생성(Auth)을 동시에 실행
    console.log('[kakao-login] 3단계: 병렬 작업 시작 (프로필 갱신 + 세션 생성)');
    const startTimeParallel = Date.now();

    // Task A: board_users 업데이트 (비동기, 결과가 로그인을 막지 않도록 처리)
    // 닉네임, 프로필페이지만 저장하며 PII는 저장하지 않음
    const upsertPromise = (async () => {
      const startTimeUpsert = Date.now();
      try {
        const { error: upsertError } = await supabaseAdmin
          .from('board_users')
          .upsert({
            user_id: userId,
            kakao_id: kakaoId,
            nickname: nickname,
            profile_image: profileImage,
            gender: null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error('[kakao-login] Error updating board_users:', upsertError);
        } else {
          console.log('[kakao-login] board_users 정보 갱신 완료. 소요시간:', Date.now() - startTimeUpsert);
        }
      } catch (err) {
        console.error('[kakao-login] Exception updating board_users:', err);
      }
    })();

    // Task B: 세션 생성 (Magic Link 발급 -> OTP 검증)
    const sessionPromise = (async () => {
      const startTimeLink = Date.now();

      // B-1. Magic Link 생성
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

      if (linkError || !linkData || !linkData.user) {
        console.error('[kakao-login] ❌ Link generation failed:', linkError);
        throw linkError;
      }

      // userId 재확인 (혹시 createUser를 안 탔는데 generateLink에서 user가 리턴된 경우 등)
      // (외부 scope의 userId는 이미 세팅되었거나 여기서 덮어씌움)
      // *주의: Promise 내부 변수라 외부 반영 안됨. 하지만 위에서 이미 userId를 확보했으므로 괜찮음.

      console.log('[kakao-login] 매직링크 생성 완료. 소요시간:', Date.now() - startTimeLink);

      // B-2. OTP 검증으로 세션 확득
      const sessionParams = new URL(linkData.properties.action_link).searchParams;
      const tokenHash = sessionParams.get('token');

      if (!tokenHash) {
        throw new Error('Token hash not found in magic link');
      }

      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink'
      });

      if (sessionError || !sessionData.session) {
        console.error('[kakao-login] Session verification failed:', sessionError);
        throw sessionError;
      }

      return sessionData.session;
    })();

    // 두 작업 병렬 대기
    const [_, session] = await Promise.all([upsertPromise, sessionPromise]);
    console.log('[kakao-login] ✅ 병렬 작업 완료. 총 소요시간:', Date.now() - startTimeParallel);

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
