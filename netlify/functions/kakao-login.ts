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
    const kakaoAccessToken = tokenData.access_token;
    const kakaoRefreshToken = tokenData.refresh_token;

    console.log('[kakao-login] ✅ 토큰 교환 성공:', {
      hasAccessToken: !!kakaoAccessToken,
      hasRefreshToken: !!kakaoRefreshToken,
      accessTokenLength: kakaoAccessToken?.length,
      refreshTokenLength: kakaoRefreshToken?.length
    });

    // 2. 카카오 사용자 정보 가져오기
    console.log('[kakao-login] 2단계: 카카오 사용자 정보 조회 시작');
    const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    console.log('[kakao-login] 사용자 정보 조회 응답:', {
      status: kakaoUserResponse.status,
      ok: kakaoUserResponse.ok
    });

    if (!kakaoUserResponse.ok) {
      console.error('[kakao-login] ❌ 카카오 사용자 정보 조회 실패');
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid Kakao Token' }) };
    }

    const kakaoUser = await kakaoUserResponse.json();
    const email = kakaoUser.kakao_account?.email;
    const realName = kakaoUser.kakao_account?.name;
    const phone = kakaoUser.kakao_account?.phone_number;
    const nickname = kakaoUser.kakao_account?.profile?.nickname || 'Unknown';
    const profileImage = kakaoUser.kakao_account?.profile?.profile_image_url;
    const kakaoId = kakaoUser.id.toString();

    console.log('[kakao-login] ✅ 사용자 정보 조회 성공:', {
      hasEmail: !!email,
      email,
      hasNickname: !!nickname,
      hasKakaoId: !!kakaoId
    });

    if (!email) {
      console.error('[kakao-login] ❌ 카카오 이메일 없음');
      return { statusCode: 400, body: JSON.stringify({ error: 'Kakao email not found' }) };
    }

    // 2. Supabase 사용자 처리 (생성 시도)
    // listUsers()는 50명 제한이 있으므로, 무조건 생성을 시도하고 "이미 존재함" 에러를 무시하는 방식으로 변경
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: {
        name: nickname,
        kakao_id: kakaoId
      }
    });

    if (createError && !createError.message?.toLowerCase().includes("registered")) {
      // "User already registered" 에러 외의 다른 에러는 실제 실패로 처리
      console.error('[kakao-login] Create user failed:', createError);
      throw createError;
    }

    // 3. 로그인 세션 생성을 위한 매직 링크 발급 (여기서 확실한 userId를 얻음)
    // createUser가 실패(이미 존재)했더라도 generateLink는 해당 이메일의 유저 정보를 반환함
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData || !linkData.user) {
      console.error('[kakao-login] Link generation failed:', linkError);
      throw linkError;
    }

    const userId = linkData.user.id;

    // 3. board_users 업데이트 (닉네임, 프로필페이지만 저장하며 PII는 저장하지 않음)
    const { error: upsertError } = await supabaseAdmin
      .from('board_users')
      .upsert({
        user_id: userId,
        kakao_id: kakaoId,
        nickname: nickname,
        profile_image: profileImage,
        gender: null, // gender 컬럼이 NOT NULL이면 null 명시
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('Error updating board_users:', upsertError);
      console.error('HINT: SUPABASE_SERVICE_KEY 환경변수가 올바른 service_role key인지 확인하세요 (anon key 불가)');
      // RLS 에러가 나도 로그인은 계속 진행 (사용자 정보가 없을 뿐)
    }

    // 4. 보안 토큰 처리 (RSA 암호화) - 현재 비활성화
    // RLS 정책 문제로 인해 에러 발생하므로 주석 처리
    // 로그인 기능에는 영향 없음
    /*
    const tokenToSave = kakaoRefreshToken || kakaoAccessToken;

    if (tokenToSave) {
      console.log(`[kakao-login] Processing security token for user: ${userId}`);

      const { data: keyData, error: keyError } = await supabaseAdmin
        .from('system_keys')
        .select('public_key')
        .eq('id', 1)
        .single();

      if (keyError || !keyData) {
        console.error('[kakao-login] Failed to fetch system public key:', keyError);
      } else {
        const publicKey = keyData.public_key;

        try {
          console.log('[kakao-login] Encrypting token...');
          const encryptedBuffer = crypto.publicEncrypt(
            {
              key: publicKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            },
            Buffer.from(tokenToSave)
          );
          const encryptedToken = encryptedBuffer.toString('base64');
          console.log('[kakao-login] Encryption success. Upserting to user_tokens...');

          const { data: upsertData, error: tokenUpsertError } = await supabaseAdmin
            .from('user_tokens')
            .upsert({
              user_id: userId,
              encrypted_token: encryptedToken,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            })
            .select();

          if (tokenUpsertError) {
            console.error('[kakao-login] ❌ user_tokens upsert FAILED:', {
              error: tokenUpsertError,
              message: tokenUpsertError.message,
              code: tokenUpsertError.code,
              details: tokenUpsertError.details,
              hint: tokenUpsertError.hint
            });
          } else if (!upsertData || upsertData.length === 0) {
            console.error('[kakao-login] ❌ Upsert returned no data! Possible RLS issue.');
          } else {
            console.log('[kakao-login] ✅ Security token upsert returned data:', upsertData);
            console.log('[kakao-login] Verifying with separate SELECT...');

            const { data: verifyData, error: verifyError } = await supabaseAdmin
              .from('user_tokens')
              .select('user_id')
              .eq('user_id', userId)
              .single();

            if (verifyError || !verifyData) {
              console.error('[kakao-login] ❌ VERIFICATION FAILED! Record not found.', {
                error: verifyError,
                userId: userId
              });
            } else {
              console.log('[kakao-login] ✅ VERIFICATION SUCCESS. Record exists for:', userId);
            }
          }
        } catch (encError) {
          console.error('[kakao-login] Token encryption/save process failed:', encError);
        }
      }
    } else {
      console.warn('[kakao-login] No kakao token found to save.');
    }
    */

    // 5. 로그인 세션 생성 (Magic Link 방식)
    // 앞서(3단계) 생성한 링크 정보를 그대로 사용함 ("generateLink"를 두 번 호출하면 토큰이 갱신되어 앞의 것이 무효화될 수 있음)
    // 따라서 다시 호출하지 않고, 위에서 받은 linkData를 사용합니다.

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

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        email,
        name: nickname,
        isAdmin: email === adminEmail,
        session: sessionData.session
      })
    };

  } catch (err: any) {
    console.error('Kakao login error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
