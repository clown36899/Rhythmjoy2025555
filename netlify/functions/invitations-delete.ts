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
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { invitationId, adminEmail: requestAdminEmail } = JSON.parse(event.body || '{}');

    if (requestAdminEmail !== adminEmail) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: '권한이 없습니다' })
      };
    }

    if (!invitationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '초대 ID가 필요합니다' })
      };
    }

    // 초대 정보 조회
    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (fetchError || !invitation) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '초대를 찾을 수 없습니다' })
      };
    }

    // 초대가 사용되었으면 관련 사용자 계정도 삭제
    if (invitation.used) {
      const { data: billboardUser } = await supabaseAdmin
        .from('billboard_users')
        .select('*')
        .eq('email', invitation.email)
        .single();

      if (billboardUser) {
        // billboard_user_settings 삭제
        await supabaseAdmin
          .from('billboard_user_settings')
          .delete()
          .eq('billboard_user_id', billboardUser.id);

        // billboard_users 삭제
        await supabaseAdmin
          .from('billboard_users')
          .delete()
          .eq('id', billboardUser.id);

        console.log(`Deleted billboard user: ${billboardUser.email}`);
      }
    }

    // 초대 삭제
    const { error: deleteError } = await supabaseAdmin
      .from('invitations')
      .delete()
      .eq('id', invitationId);

    if (deleteError) {
      console.error('Invitation deletion error:', deleteError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '초대 삭제 실패' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Delete invitation error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다' })
    };
  }
};

export { handler };
