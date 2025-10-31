import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const adminEmail = process.env.VITE_ADMIN_EMAIL!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { kakaoAccessToken, invitationToken } = JSON.parse(event.body || '{}');

    if (!kakaoAccessToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '카카오 액세스 토큰이 필요합니다' })
      };
    }

    const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    if (!kakaoUserResponse.ok) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: '카카오 토큰 검증 실패' })
      };
    }

    const kakaoUser = await kakaoUserResponse.json();
    const email = kakaoUser.kakao_account?.email;
    const name = kakaoUser.kakao_account?.profile?.nickname || kakaoUser.kakao_account?.name || '카카오 사용자';

    if (!email) {
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
      .select('id, name, email')
      .eq('email', email)
      .single();

    // 초대 코드로 신규 가입하는 경우 billboard_users 생성
    if (invitation && !billboardUser) {
      const randomPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);
      const salt = Math.random().toString(36).slice(-8);
      const crypto = await import('crypto');
      const hashedPassword = crypto.createHash('sha256').update(salt + randomPassword).digest('hex');

      const { data: newBillboardUser, error: createBillboardError } = await supabaseAdmin
        .from('billboard_users')
        .insert({
          name,
          email,
          username: email.split('@')[0],
          password: hashedPassword,
          salt,
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

      billboardUser = newBillboardUser;

      // 빌보드 사용자 설정 기본값 생성
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

      // 초대 코드 사용 처리
      if (invitation) {
        await supabaseAdmin
          .from('invitations')
          .update({ used: true })
          .eq('id', invitation.id);
      }
    }

    if (!isAdmin && !billboardUser) {
      return {
        statusCode: 403,
        body: JSON.stringify({ 
          error: '초대받지 않은 사용자입니다',
          message: '관리자에게 초대를 요청하세요'
        })
      };
    }

    const { data: existingUserData } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUserData?.users.find(u => u.email === email);

    let userId: string;

    if (userExists) {
      userId = userExists.id;
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        email,
        name,
        isAdmin,
        isBillboardUser: !!billboardUser,
        billboardUserId: billboardUser?.id || null,
        billboardUserName: billboardUser?.name || null,
        token: hashedToken,
        tokenType: 'magiclink'
      })
    };

  } catch (error: any) {
    console.error('Kakao auth error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다', details: error.message })
    };
  }
};
