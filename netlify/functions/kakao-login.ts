import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// 전역 변수로 선언만 해두고 핸들러 내부에서 초기화
let supabaseAdmin: any = null;

export const handler: Handler = async (event) => {
  // 1. HTTP 메소드 체크
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // 2. 환경변수 및 Supabase 클라이언트 초기화 (핸들러 내부에서 실행하여 에러 포착)
  try {
    /* 🚨 디버깅용: 강제 성공 리턴 - 주석 해제하여 테스트 */
    const debugEnv = {
      VITE_PUBLIC_SUPABASE_URL: process.env.VITE_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'exists' : 'missing',
      VITE_ADMIN_EMAIL: process.env.VITE_ADMIN_EMAIL
    };

    // 환경변수 체크를 위해 디버그 모드 활성화 상태로 유지
    // return {
    //   statusCode: 200,
    //   body: JSON.stringify({
    //     success: true,
    //     message: '함수 연결 성공! (환경변수 체크)',
    //     debug: debugEnv
    //   })
    // };

    const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const adminEmail = process.env.VITE_ADMIN_EMAIL;

    if (!supabaseUrl || !supabaseServiceKey || !adminEmail) {
      console.error('[kakao-auth] 필수 환경변수 누락');
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: '서버 설정 오류: 필수 환경변수가 누락되었습니다.',
          debug: {
            hasSupabaseUrl: !!supabaseUrl,
            hasServiceKey: !!supabaseServiceKey,
            hasAdminEmail: !!adminEmail,
            envKeys: Object.keys(process.env).filter(k => k.includes('VITE') || k.includes('SUPABASE'))
          }
        })
      };
    }

    // 클라이언트가 없으면 초기화 (싱글톤 패턴)
    if (!supabaseAdmin) {
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey as string, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    }
  } catch (initError: any) {
    console.error('[kakao-auth] 초기화 에러:', initError);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: '서버 초기화 실패',
        details: initError.message
      })
    };
  }

  try {
    // 기존 로직 시작...
    console.log('[kakao-auth] 요청 처리 시작');

    // 환경변수는 이미 위에서 체크했으므로 여기서는 안전하게 사용 (타입 단언)
    const adminEmail = process.env.VITE_ADMIN_EMAIL as string;

    const { kakaoAccessToken, invitationToken, displayName } = JSON.parse(event.body || '{}');
    console.log('[kakao-auth] 요청 데이터:', {
      hasKakaoAccessToken: !!kakaoAccessToken,
      hasInvitationToken: !!invitationToken,
      hasDisplayName: !!displayName
    });

    if (!kakaoAccessToken) {
      console.log('[kakao-auth] 카카오 액세스 토큰 없음');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '카카오 액세스 토큰이 필요합니다' })
      };
    }

    console.log('[kakao-auth] 카카오 API 호출 시작');
    const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    console.log('[kakao-auth] 카카오 API 응답:', {
      status: kakaoUserResponse.status,
      ok: kakaoUserResponse.ok
    });

    if (!kakaoUserResponse.ok) {
      console.log('[kakao-auth] 카카오 토큰 검증 실패');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: '카카오 토큰 검증 실패' })
      };
    }

    const kakaoUser = await kakaoUserResponse.json();
    const email = kakaoUser.kakao_account?.email;
    const kakaoNickname = kakaoUser.kakao_account?.profile?.nickname || kakaoUser.kakao_account?.name || '카카오 사용자';
    const name = displayName || kakaoNickname;

    // 추가 정보 추출 (동의항목 설정이 되어있을 경우)
    const realName = kakaoUser.kakao_account?.name; // 실명
    const rawPhoneNumber = kakaoUser.kakao_account?.phone_number; // +82 10-1234-5678 형식

    /* 카카오 전화번호 포맷팅 (+82 10-1234-5678 -> 010-1234-5678) */
    let phoneNumber = '';
    if (rawPhoneNumber) {
      if (rawPhoneNumber.startsWith('+82')) {
        phoneNumber = rawPhoneNumber.replace('+82 ', '0').replace(/-/g, '-'); // 010-1234-5678 (하이픈 유지)
      } else {
        phoneNumber = rawPhoneNumber;
      }
    }

    console.log('[kakao-auth] 카카오 사용자 정보:', {
      hasEmail: !!email,
      email: email,
      name: name,
      hasRealName: !!realName,
      hasPhone: !!phoneNumber
    });

    if (!email) {
      console.log('[kakao-auth] 이메일 없음');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '카카오 계정에서 이메일을 가져올 수 없습니다' })
      };
    }

    const isAdmin = email === adminEmail;

    // 초대 코드가 있으면 검증 및 처리
    let invitation: any = null;
    if (invitationToken && !isAdmin) {
      const { data: inv, error: invError } = await supabaseAdmin
        .from('invitations')
        .select('*')
        .eq('token', invitationToken)
        .single();

      if (invError || !inv) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: '유효하지 않은 초대 코드입니다' })
        };
      }

      if (inv.used) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: '이미 사용된 초대 코드입니다' })
        };
      }

      if (new Date(inv.expires_at) < new Date()) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: '만료된 초대 코드입니다' })
        };
      }

      if (inv.email !== email) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: '초대된 이메일과 카카오 이메일이 일치하지 않습니다',
            message: `이 초대는 ${inv.email}을 위한 것입니다`
          })
        };
      }

      invitation = inv;
    }

    let { data: billboardUser } = await supabaseAdmin
      .from('billboard_users')
      .select('*')
      .eq('email', email)
      .single();

    // 초대 코드로 신규 가입하는 경우 billboard_users 생성
    if (invitation && !billboardUser) {
      const randomPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);

      // salt + 10,000번 SHA-256 해싱
      const salt = crypto.randomUUID();
      const encoder = new TextEncoder();
      const data = encoder.encode(randomPassword + salt);

      let hashBuffer = await crypto.subtle.digest('SHA-256', data);
      for (let i = 0; i < 10000; i++) {
        hashBuffer = await crypto.subtle.digest('SHA-256', hashBuffer);
      }

      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const passwordHash = `${salt}:${hashHex}`;

      const { data: newBillboardUser, error: createBillboardError } = await supabaseAdmin
        .from('billboard_users')
        .insert({
          name,
          password_hash: passwordHash,
          is_active: true
        })
        .select()
        .single();

      if (createBillboardError) {
        console.error('Billboard user creation error:', createBillboardError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: '빌보드 사용자 생성 실패' })
        };
      }

      // email 별도 업데이트 (스키마 캐시 문제 회피)
      if (newBillboardUser) {
        await supabaseAdmin
          .from('billboard_users')
          .update({ email })
          .eq('id', newBillboardUser.id);
      }

      billboardUser = newBillboardUser;

      // 빌보드 사용자 설정 기본값 생성
      if (billboardUser) {
        const { error: settingsError } = await supabaseAdmin
          .from('billboard_user_settings')
          .insert({
            billboard_user_id: billboardUser.id,
            excluded_weekdays: [],
            excluded_event_ids: [],
            auto_slide_interval: 5000,
            transition_duration: 1000,
            play_order: 'sequential',
            date_filter_start: null,
            date_filter_end: null,
            video_play_duration: 10000
          });

        if (settingsError) {
          console.error('Billboard settings creation error:', settingsError);
        }
      }

      // 초대 코드 사용 처리
      if (invitation) {
        await supabaseAdmin
          .from('invitations')
          .update({ used: true })
          .eq('id', invitation.id);
      }
    }

    // billboard_users는 선택사항 - 없어도 일반 로그인은 가능
    console.log('[kakao-auth] Billboard 사용자 확인:', {
      isAdmin,
      hasBillboardUser: !!billboardUser,
      billboardUserId: billboardUser?.id
    });

    console.log('[kakao-auth] Supabase Auth 사용자 조회 시작:', email);

    // 이메일로 사용자 조회 (페이지네이션 제한 추가)
    let userExists = null;
    try {
      const { data: existingUserData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (listError) {
        console.error('[kakao-auth] listUsers 에러:', listError);
        throw new Error(`사용자 목록 조회 실패: ${listError.message}`);
      }

      userExists = existingUserData?.users.find((u: any) => u.email === email);
      console.log('[kakao-auth] 사용자 조회 결과:', {
        found: !!userExists,
        userId: userExists?.id
      });
    } catch (e: any) {
      console.error('[kakao-auth] 사용자 조회 중 에러:', e);
      throw new Error(`사용자 조회 실패: ${e.message}`);
    }

    let userId: string;

    if (userExists) {
      userId = userExists.id;
      console.log('[kakao-auth] 기존 사용자 ID 사용:', userId);
    } else {
      const randomPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          name,
          kakao_id: kakaoUser.id
        }
      });

      if (createError || !newUser.user) {
        console.error('User creation error:', createError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: '계정 생성 실패' })
        };
      }

      userId = newUser.user.id;

      if (billboardUser) {
        await supabaseAdmin
          .from('billboard_users')
          .update({ auth_user_id: userId, email })
          .eq('id', billboardUser.id);
      }
    }

    // [자동 가입] 카카오에서 실명/전화번호를 가져왔다면 board_users에 저장
    if (realName && phoneNumber) {
      try {
        console.log('[kakao-auth] 실명/전화번호 자동 저장 시도:', { userId, realName });

        // 기존 정보 확인 (덮어쓰기 방지 옵션 - 필요시 로직 조정 가능)
        const { data: existingBoardUser } = await supabaseAdmin
          .from('board_users')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (!existingBoardUser) {
          await supabaseAdmin.from('board_users').insert({
            user_id: userId,
            nickname: kakaoNickname, // 카카오 닉네임을 기본값으로 사용
            real_name: realName,
            phone: phoneNumber,
            gender: kakaoUser.kakao_account?.gender || 'other' // 성별도 있으면 저장
          });
          console.log('[kakao-auth] board_users 자동 생성 완료');
        } else {
          // 이미 있으면 업데이트? (선택사항 - 현재는 업데이트 안 함)
          console.log('[kakao-auth] 이미 board_users 정보가 존재함');
        }
      } catch (autoRegError) {
        console.error('[kakao-auth] 자동 가입 처리 중 오류 (무시됨):', autoRegError);
      }
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData) {
      console.error('Magic link generation error:', linkError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: '세션 생성 실패' })
      };
    }

    const hashedToken = new URL(linkData.properties.action_link).searchParams.get('token');

    if (!hashedToken) {
      console.error('토큰 추출 실패');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: '토큰 생성 실패' })
      };
    }

    // billboard_user가 있으면 그 이름을 우선 사용
    const displayNameToShow = billboardUser?.name || name;

    // 토큰을 사용하여 세션 생성
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink'
    });

    if (sessionError || !sessionData.session) {
      console.error('Session creation error:', sessionError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: '세션 생성 실패' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        email,
        name: displayNameToShow,
        isAdmin,
        isBillboardUser: !!billboardUser,
        billboardUserId: billboardUser?.id || null,
        billboardUserName: billboardUser?.name || null,
        session: sessionData.session
      })
    };

  } catch (error: any) {
    console.error('Kakao auth error:', error);

    try {
      const { invitationToken } = JSON.parse(event.body || '{}');
      await supabaseAdmin.from('invitation_logs').insert({
        invitation_token: invitationToken || null,
        email: null,
        action: 'kakao_auth',
        status: 'error',
        error_message: error.message || '서버 오류가 발생했습니다',
        user_agent: event.headers['user-agent'] || 'unknown',
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'
      });
    } catch (e) {
      console.error('Log error:', e);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다', details: error.message })
    };
  }
};
