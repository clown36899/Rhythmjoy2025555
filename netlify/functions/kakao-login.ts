import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// 전역 변수 (재사용)
let supabaseAdmin: any = null;
let cachedPublicKey: string | null = null;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const adminEmail = process.env.VITE_ADMIN_EMAIL;

  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { code, redirectUri } = body;

    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing authorization code' }) };
    }

    // 1. 인증 코드로 액세스 토큰 교환
    const restApiKey = process.env.VITE_KAKAO_REST_API_KEY || process.env.KAKAO_REST_API_KEY;

    if (!restApiKey) {
      console.error('[kakao-login] Missing KAKAO_REST_API_KEY environment variable');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key' }) };
    }

    console.log('[kakao-login] Exchanging authorization code for token...');

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

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[kakao-login] Token exchange failed:', errorText);
      return { statusCode: 401, body: JSON.stringify({ error: 'Failed to exchange authorization code', details: errorText }) };
    }

    const tokenData = await tokenResponse.json();
    const kakaoAccessToken = tokenData.access_token;
    const kakaoRefreshToken = tokenData.refresh_token;

    // 2. 카카오 사용자 정보 가져오기
    const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    if (!kakaoUserResponse.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid Kakao Token' }) };
    }

    const kakaoUser = await kakaoUserResponse.json();
    const email = kakaoUser.kakao_account?.email;
    const realName = kakaoUser.kakao_account?.name;
    const phone = kakaoUser.kakao_account?.phone_number;
    const nickname = kakaoUser.kakao_account?.profile?.nickname || 'Unknown';
    const profileImage = kakaoUser.kakao_account?.profile?.profile_image_url;
    const kakaoId = kakaoUser.id.toString();

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Kakao email not found' }) };
    }

    // 2. Supabase 사용자 처리 (생성 또는 조회)
    let userId: string;
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    // 이메일로 간단 매칭
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // 신규 가입
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
      if (createError || !newUser.user) throw createError;
      userId = newUser.user.id;
    }

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

    if (upsertError) console.error('Error updating board_users:', upsertError);

    // 4. 보안 토큰 처리 (RSA 암호화)
    // Refresh Token이 있으면 그것을, 없으면 Access Token이라도 저장 (비상용)
    const tokenToSave = kakaoRefreshToken || kakaoAccessToken;

    if (tokenToSave) {
      // 4-1. 공개키 가져오기
      if (!cachedPublicKey) {
        const { data: keyData, error: keyError } = await supabaseAdmin
          .from('system_keys') // public schema
          .select('public_key')
          .eq('id', 1)
          .single();

        if (!keyError && keyData) {
          cachedPublicKey = keyData.public_key;
        } else {
          console.error('Failed to fetch system public key:', keyError);
        }
      }

      // 4-2. 암호화 및 저장
      if (cachedPublicKey) {
        try {
          const encryptedBuffer = crypto.publicEncrypt(
            {
              key: cachedPublicKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            },
            Buffer.from(tokenToSave)
          );
          const encryptedToken = encryptedBuffer.toString('base64');

          await supabaseAdmin
            .from('user_tokens')
            .upsert({
              user_id: userId,
              encrypted_token: encryptedToken,
              updated_at: new Date().toISOString()
            });
        } catch (encError) {
          console.error('Token encryption failed:', encError);
        }
      }
    }

    // 5. 로그인 세션 생성 (Magic Link 방식)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData) {
      console.error('[kakao-login] Link generation failed:', linkError);
      throw linkError;
    }

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
