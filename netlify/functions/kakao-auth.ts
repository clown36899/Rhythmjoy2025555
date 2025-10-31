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
    const { kakaoAccessToken } = JSON.parse(event.body || '{}');

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
    
    const { data: billboardUser } = await supabaseAdmin
      .from('billboard_users')
      .select('id, name, email')
      .eq('email', email)
      .single();

    if (!isAdmin && !billboardUser) {
      return {
        statusCode: 403,
        body: JSON.stringify({ 
          error: '초대받지 않은 사용자입니다',
          message: '관리자에게 초대를 요청하세요'
        })
      };
    }

    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUser?.users.find(u => u.email === email);

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

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${event.headers.origin || 'http://localhost:5000'}/`
      }
    });

    if (sessionError || !sessionData) {
      console.error('Session generation error:', sessionError);
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
        name,
        isAdmin,
        isBillboardUser: !!billboardUser,
        billboardUserId: billboardUser?.id || null,
        billboardUserName: billboardUser?.name || null,
        magicLink: sessionData.properties.hashed_token
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
