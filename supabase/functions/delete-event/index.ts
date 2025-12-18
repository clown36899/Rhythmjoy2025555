// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// CORS 헤더 설정 (모든 출처 허용)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // CORS preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { eventId, password } = await req.json()

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Event ID is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 서비스 역할 키를 사용하여 모든 권한을 가진 관리자 클라이언트 생성
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 1. DB에서 이벤트 정보 조회 (비밀번호, 파일 경로 등)
    const { data: event, error: fetchError } = await supabaseAdmin
      .from('events')
      .select('password, storage_path, image, image_thumbnail, image_medium, image_full, user_id')
      .eq('id', eventId)
      .single()

    if (fetchError) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. 권한 확인: 슈퍼 관리자 또는 비밀번호 일치 여부 또는 본인 글 여부
    let isAuthorized = false;
    const authHeader = req.headers.get('Authorization');

    if (authHeader) {
      const userSupabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userSupabase.auth.getUser();

      // 관리자 권한 확인 (Claims 또는 이메일)
      const adminEmail = Deno.env.get('ADMIN_EMAIL');
      if (user?.app_metadata?.claims?.is_admin === true || (adminEmail && user.email === adminEmail)) {
        isAuthorized = true;
      }

      // 본인 글 확인 (event.user_id와 현재 로그인한 user.id 비교)
      if (user && event.user_id && user.id === event.user_id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && event.password === password) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Invalid password or insufficient permissions.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. 스토리지 파일 삭제 (권한 확인 완료 후)
    if (event.storage_path) {
      const { data: files } = await supabaseAdmin.storage.from('images').list(event.storage_path);
      if (files && files.length > 0) {
        const filePaths = files.map((file: any) => `${event.storage_path}/${file.name}`);
        await supabaseAdmin.storage.from('images').remove(filePaths);
      }
    } else {
      const extractPath = (url: string | null) => url ? decodeURIComponent(url.split('/images/')[1]?.split('?')[0]) : null;
      const paths = [...new Set([event.image, event.image_thumbnail, event.image_medium, event.image_full].map(extractPath).filter(Boolean))] as string[];
      if (paths.length > 0) {
        await supabaseAdmin.storage.from('images').remove(paths);
      }
    }

    // 4. DB 레코드 삭제
    await supabaseAdmin.from('events').delete().eq('id', eventId);

    return new Response(JSON.stringify({ message: 'Event deleted successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
