import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
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

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS 헤더
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Email',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // OPTIONS 요청 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // GET: 초대 목록 조회
    if (event.httpMethod === 'GET') {
      const requestAdminEmail = event.headers['x-admin-email'];

      if (requestAdminEmail !== adminEmail) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: '권한이 없습니다' })
        };
      }

      const { data, error } = await supabaseAdmin
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Invitations fetch error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '초대 목록 조회 실패' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ invitations: data })
      };
    }

    // POST: 초대 생성
    if (event.httpMethod === 'POST') {
      const { email, adminEmail: requestAdminEmail } = JSON.parse(event.body || '{}');

      if (requestAdminEmail !== adminEmail) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: '권한이 없습니다' })
        };
      }

      if (!email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '이메일이 필요합니다' })
        };
      }

      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

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
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '초대 생성 실패' })
        };
      }

      const origin = event.headers.origin || event.headers.referer || 'https://your-domain.com';
      const inviteUrl = `${origin}/invite/${token}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          invitation: data,
          inviteUrl
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다' })
    };
  }
};

export { handler };
