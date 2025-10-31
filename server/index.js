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

// 초대 코드 생성 (슈퍼 관리자만)
app.post('/api/invitations', async (req, res) => {
  try {
    const { email, adminEmail: requestAdminEmail } = req.body;

    if (requestAdminEmail !== adminEmail) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    if (!email) {
      return res.status(400).json({ error: '이메일이 필요합니다' });
    }

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7일 후 만료

    const { data, error } = await supabaseAdmin
      .from('invitations')
      .insert({
        email,
        invited_by: requestAdminEmail,
        token,
        expires_at: expiresAt.toISOString(),
        used: false
      })
      .select()
      .single();

    if (error) {
      console.error('Invitation creation error:', error);
      return res.status(500).json({ error: '초대 생성 실패' });
    }

    const inviteUrl = `${req.headers.origin || 'http://localhost:5000'}/invite/${token}`;

    res.json({
      success: true,
      invitation: data,
      inviteUrl
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

// 초대 목록 조회 (슈퍼 관리자만)
app.get('/api/invitations', async (req, res) => {
  try {
    const requestAdminEmail = req.headers['x-admin-email'];

    if (requestAdminEmail !== adminEmail) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Invitations fetch error:', error);
      return res.status(500).json({ error: '초대 목록 조회 실패' });
    }

    res.json({ invitations: data });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

// 초대 코드 검증
app.post('/api/invitations/validate', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: '초대 코드가 필요합니다' });
    }

    const { data: invitation, error } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ error: '유효하지 않은 초대 코드입니다' });
    }

    if (invitation.used) {
      return res.status(400).json({ error: '이미 사용된 초대 코드입니다' });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: '만료된 초대 코드입니다' });
    }

    res.json({
      valid: true,
      email: invitation.email
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

app.post('/api/auth/kakao', async (req, res) => {
  try {
    const { kakaoAccessToken, invitationToken } = req.body;

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
    
    // 초대 코드가 있으면 반드시 검증 (관리자도 예외 없음)
    let invitation = null;
    if (invitationToken) {
      const { data: inv, error: invError } = await supabaseAdmin
        .from('invitations')
        .select('*')
        .eq('token', invitationToken)
        .single();

      if (invError || !inv) {
        return res.status(404).json({ error: '유효하지 않은 초대 코드입니다' });
      }

      if (inv.used) {
        return res.status(400).json({ error: '이미 사용된 초대 코드입니다' });
      }

      if (new Date(inv.expires_at) < new Date()) {
        return res.status(400).json({ error: '만료된 초대 코드입니다' });
      }

      if (inv.email !== email) {
        return res.status(400).json({ 
          error: '초대된 이메일과 카카오 이메일이 일치하지 않습니다',
          message: `이 초대는 ${inv.email}을 위한 것입니다. 카카오 계정 이메일: ${email}`
        });
      }

      // 관리자 이메일로 초대하는 것은 허용하지 않음
      if (isAdmin) {
        return res.status(400).json({ 
          error: '관리자는 초대 링크를 사용할 수 없습니다',
          message: '관리자는 일반 로그인을 사용하세요'
        });
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
        return res.status(500).json({ error: '빌보드 사용자 생성 실패' });
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
      await supabaseAdmin
        .from('invitations')
        .update({ used: true })
        .eq('id', invitation.id);
    }

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

    // 임시 비밀번호 생성
    const tempPassword = Math.random().toString(36).slice(-32) + Math.random().toString(36).slice(-32);
    
    // 사용자의 비밀번호 업데이트 (세션 생성을 위해)
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword
    });

    // 서버에서 세션 생성 (signInWithPassword)
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseClient = createClient(supabaseUrl, process.env.VITE_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
      email,
      password: tempPassword
    });

    if (sessionError || !sessionData.session) {
      console.error('Session creation error:', sessionError);
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
      session: sessionData.session
    });

  } catch (error) {
    console.error('Kakao auth error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Auth server running on http://localhost:${PORT}`);
});
