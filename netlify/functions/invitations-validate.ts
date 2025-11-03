import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { token } = JSON.parse(event.body || '{}');
    const userAgent = event.headers['user-agent'] || 'unknown';
    const ipAddress = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';

    const logError = async (status: string, errorMessage: string, email?: string) => {
      try {
        await supabaseAdmin.from('invitation_logs').insert({
          invitation_token: token,
          email: email || null,
          action: 'validate',
          status,
          error_message: errorMessage,
          user_agent: userAgent,
          ip_address: ipAddress
        });
      } catch (e) {
        console.error('Log error:', e);
      }
    };

    if (!token) {
      await logError('error', '초대 코드가 필요합니다');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '초대 코드가 필요합니다' })
      };
    }

    const { data: invitation, error } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !invitation) {
      await logError('error', '유효하지 않은 초대 코드입니다');
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '유효하지 않은 초대 코드입니다' })
      };
    }

    if (invitation.used) {
      await logError('error', '이미 사용된 초대 코드입니다', invitation.email);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '이미 사용된 초대 코드입니다' })
      };
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await logError('error', '만료된 초대 코드입니다', invitation.email);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '만료된 초대 코드입니다' })
      };
    }

    await logError('success', '초대 코드 검증 성공', invitation.email);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        email: invitation.email
      })
    };

  } catch (error) {
    console.error('Validate invitation error:', error);
    try {
      await supabaseAdmin.from('invitation_logs').insert({
        invitation_token: null,
        email: null,
        action: 'validate',
        status: 'error',
        error_message: error instanceof Error ? error.message : '서버 오류가 발생했습니다',
        user_agent: event.headers['user-agent'] || 'unknown',
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'
      });
    } catch (e) {
      console.error('Log error:', e);
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다' })
    };
  }
};

export { handler };
