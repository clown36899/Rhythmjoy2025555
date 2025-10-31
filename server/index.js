import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const adminEmail = process.env.VITE_ADMIN_EMAIL;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

app.post('/api/auth/kakao', async (req, res) => {
  try {
    const { kakaoAccessToken } = req.body;

    if (!kakaoAccessToken) {
      return res.status(400).json({ error: '카카오 액세스 토큰이 필요합니다' });
    }

    const kakaoUserResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    if (!kakaoUserResponse.ok) {
      return res.status(401).json({ error: '카카오 토큰 검증 실패' });
    }

    const kakaoUser = await kakaoUserResponse.json();
    const email = kakaoUser.kakao_account?.email;
    const name = kakaoUser.kakao_account?.profile?.nickname || kakaoUser.kakao_account?.name || '카카오 사용자';

    if (!email) {
      return res.status(400).json({ error: '카카오 계정에서 이메일을 가져올 수 없습니다' });
    }

    const isAdmin = email === adminEmail;
    
    const { data: billboardUser } = await supabaseAdmin
      .from('billboard_users')
      .select('id, name, email')
      .eq('email', email)
      .single();

    if (!isAdmin && !billboardUser) {
      return res.status(403).json({ 
        error: '초대받지 않은 사용자입니다',
        message: '관리자에게 초대를 요청하세요'
      });
    }

    const { data: existingUserData } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUserData?.users.find(u => u.email === email);

    let userId;

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
        return res.status(500).json({ error: '계정 생성 실패' });
      }

      userId = newUser.user.id;

      if (billboardUser) {
        await supabaseAdmin
          .from('billboard_users')
          .update({ auth_user_id: userId, email })
          .eq('id', billboardUser.id);
      }
    }

    const { data: otpData, error: otpError } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      }
    });

    if (otpError || !otpData) {
      console.error('OTP generation error:', otpError);
      return res.status(500).json({ error: '세션 생성 실패' });
    }

    res.json({
      success: true,
      email,
      name,
      isAdmin,
      isBillboardUser: !!billboardUser,
      billboardUserId: billboardUser?.id || null,
      billboardUserName: billboardUser?.name || null,
      needsOtpVerification: true
    });

  } catch (error) {
    console.error('Kakao auth error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Auth server running on http://localhost:${PORT}`);
});
