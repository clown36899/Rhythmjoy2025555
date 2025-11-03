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

    if (!token) {
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
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '유효하지 않은 초대 코드입니다' })
      };
    }

    if (invitation.used) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '이미 사용된 초대 코드입니다' })
      };
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '만료된 초대 코드입니다' })
      };
    }

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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다' })
    };
  }
};

export { handler };
