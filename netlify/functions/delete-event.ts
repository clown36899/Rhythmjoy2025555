import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY!;
const adminEmailEnv = process.env.VITE_ADMIN_EMAIL;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        const { eventId, password } = JSON.parse(event.body || '{}');

        if (!eventId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Event ID is required.' })
            };
        }

        // 1. DB에서 이벤트 정보 조회
        const { data: eventData, error: fetchError } = await supabaseAdmin
            .from('events')
            .select('password, storage_path, image, image_thumbnail, image_medium, image_full, user_id')
            .eq('id', eventId)
            .single();

        if (fetchError || !eventData) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Event not found.' })
            };
        }

        // 2. 권한 확인
        let isAuthorized = false;
        const authHeader = event.headers.authorization;

        if (authHeader) {
            const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false }
            });
            const { data: { user } } = await userSupabase.auth.getUser();

            if (user) {
                // 관리자 권한 확인 (app_metadata.is_admin 또는 이메일 일치)
                const isAdmin = user.app_metadata?.is_admin === true ||
                    (adminEmailEnv && user.email === adminEmailEnv);

                if (isAdmin) isAuthorized = true;

                // 본인 글 확인
                if (eventData.user_id && user.id === eventData.user_id) {
                    isAuthorized = true;
                }
            }
        }

        // 비밀번호 확인 (비로그인/대리 삭제용)
        if (!isAuthorized && eventData.password && eventData.password === password) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized.' })
            };
        }

        // 3. 종속 데이터 삭제 (Foreign Key 제약 해결)
        // event_favorites 삭제
        await supabaseAdmin.from('event_favorites').delete().eq('event_id', eventId);

        // comments 삭제 (있다면)
        await supabaseAdmin.from('comments').delete().eq('event_id', eventId);

        // 4. 스토리지 파일 삭제
        if (eventData.storage_path) {
            const { data: files } = await supabaseAdmin.storage.from('images').list(eventData.storage_path);
            if (files && files.length > 0) {
                const filePaths = files.map((file) => `${eventData.storage_path}/${file.name}`);
                await supabaseAdmin.storage.from('images').remove(filePaths);
            }
            // 폴더 자체는 자동 삭제되지 않으므로 빈 폴더로 남을 수 있음 (Supabase 정책)
        } else {
            // 레거시 이미지 경로 처리
            const extractPath = (url: string | null) => url ? decodeURIComponent(url.split('/images/')[1]?.split('?')[0]) : null;
            const paths = [eventData.image, eventData.image_thumbnail, eventData.image_medium, eventData.image_full]
                .map(extractPath)
                .filter((p): p is string => !!p);

            if (paths.length > 0) {
                await supabaseAdmin.storage.from('images').remove(paths);
            }
        }

        // 5. 이벤트 삭제
        const { error: deleteError } = await supabaseAdmin.from('events').delete().eq('id', eventId);

        if (deleteError) {
            throw deleteError;
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Event deleted successfully.' })
        };

    } catch (error: any) {
        console.error('Delete Event Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
        };
    }
};
