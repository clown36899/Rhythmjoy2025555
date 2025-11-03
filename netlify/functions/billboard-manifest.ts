import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const handler: Handler = async (event) => {
  // CORS 헤더
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // URL에서 userId 추출: /.netlify/functions/billboard-manifest?userId=xxx
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'userId가 필요합니다' })
      };
    }

    // 빌보드 사용자 정보 조회
    const { data: user, error } = await supabaseAdmin
      .from('billboard_users')
      .select('name')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '빌보드 사용자를 찾을 수 없습니다' })
      };
    }

    // 동적 manifest 생성 (상대 경로 사용)
    const manifest = {
      name: `${user.name} 빌보드`,
      short_name: user.name,
      description: `${user.name} 이벤트 빌보드 디스플레이`,
      start_url: `/billboard/${userId}`,
      display: 'fullscreen',
      background_color: '#000000',
      theme_color: '#000000',
      orientation: 'portrait',
      scope: '/',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(manifest)
    };
  } catch (error: any) {
    console.error('Manifest 생성 오류:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다' })
    };
  }
};
