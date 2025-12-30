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
            console.log(`[delete-event] Deleting folder: ${eventData.storage_path}`);
            // 폴더 내의 모든 파일을 나열한 뒤 한꺼번에 삭제
            const { data: files, error: listError } = await supabaseAdmin.storage.from('images').list(eventData.storage_path);

            if (listError) {
                console.warn(`[delete-event] Error listing files in ${eventData.storage_path}:`, listError);
            }

            if (files && files.length > 0) {
                const filePaths = files.map((file) => `${eventData.storage_path}/${file.name}`);
                const { error: removeError } = await supabaseAdmin.storage.from('images').remove(filePaths);
                if (removeError) {
                    console.error(`[delete-event] Error removing files in ${eventData.storage_path}:`, removeError);
                } else {
                    console.log(`[delete-event] Successfully removed ${files.length} files from ${eventData.storage_path}`);
                }
            }
        }

        // Legacy 방식 또는 storage_path와 별개로 이미지 컬럼에 직접 경로가 있는 경우 추가 삭제 시도
        const extractPath = (url: string | null) => {
            if (!url) return null;
            try {
                // URL에서 /public/images/ 이후의 경로만 추출
                if (url.includes('/images/')) {
                    return decodeURIComponent(url.split('/images/')[1]?.split('?')[0]);
                }
                return null;
            } catch (e) {
                return null;
            }
        };

        const imagePaths = [eventData.image, eventData.image_thumbnail, eventData.image_medium, eventData.image_full]
            .map(extractPath)
            .filter((p): p is string => !!p);

        // storage_path 폴더 내에 이미 지워진 파일들을 제외하고 남은 게 있으면 지움
        if (imagePaths.length > 0) {
            console.log(`[delete-event] Checking legacy/individual image paths:`, imagePaths);
            await supabaseAdmin.storage.from('images').remove(imagePaths);
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
