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
        console.log(`[delete-event] 🔥 Request received for Event ID: ${eventId}`);

        if (!eventId) {
            console.error('[delete-event] Missing eventId in request body');
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Event ID is required.' })
            };
        }

        // 1. DB에서 이벤트 정보 조회
        console.log(`[delete-event] 🔍 Fetching event ${eventId} details...`);
        const { data: eventData, error: fetchError } = await supabaseAdmin
            .from('events')
            .select('password, storage_path, image, image_thumbnail, image_medium, image_full, user_id, title')
            .eq('id', eventId)
            .single();

        if (fetchError) {
            console.log(`[delete-event] ℹ️ Event ${eventId} not found (might already be deleted):`, fetchError.message);
            // 이미 삭제된 것으로 간주하고 200 반환 (클라이언트 에러 방지)
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Event already deleted or not found.' })
            };
        }

        if (!eventData) {
            console.log(`[delete-event] ℹ️ Event ${eventId} returned no data.`);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Event not found.' })
            };
        }

        console.log(`[delete-event] ✅ Event found: "${eventData.title}" (Storage Path: ${eventData.storage_path}, Created By: ${eventData.user_id})`);

        // 2. 권한 확인
        let isAuthorized = false;
        let authReason = "";
        const authHeader = event.headers.authorization;

        if (authHeader) {
            console.log(`[delete-event] 🔑 Auth header present, verifying token...`);
            const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false }
            });
            const { data: { user }, error: userError } = await userSupabase.auth.getUser();

            if (userError) {
                console.error(`[delete-event] ❌ User verification failed:`, userError.message);
            }

            if (user) {
                console.log(`[delete-event] 👤 Authenticated user: ${user.id} (${user.email})`);

                // 관리자 권한 확인
                const isAdmin = user.app_metadata?.is_admin === true ||
                    (adminEmailEnv && user.email === adminEmailEnv);

                if (isAdmin) {
                    console.log(`[delete-event] 🎖️ Authorized as ADMIN`);
                    isAuthorized = true;
                    authReason = "Admin Privileges";
                }

                if (eventData.user_id && user.id === eventData.user_id) {
                    console.log(`[delete-event] 🎖️ Authorized as OWNER`);
                    isAuthorized = true;
                    authReason = "Resource Owner";
                }
            }
        }

        // 비밀번호 확인 (비로그인/대리 삭제용)
        if (!isAuthorized && eventData.password) {
            console.log(`[delete-event] 🔐 Checking password authorization...`);
            if (eventData.password === password) {
                console.log(`[delete-event] 🎖️ Authorized via PASSWORD`);
                isAuthorized = true;
                authReason = "Valid Password";
            } else {
                console.log(`[delete-event] ❌ Password mismatch. Provided: ${password}, DB: ${eventData.password}`);
            }
        }

        if (!isAuthorized) {
            console.warn(`[delete-event] 🚫 Unauthorized deletion attempt for Event ${eventId} (User: ${authHeader ? 'ID Found' : 'No Header'})`);
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized.' })
            };
        }

        console.log(`[delete-event] 🚀 Starting deletion process (Reason: ${authReason})...`);

        // 3. 종속 데이터 삭제 (Foreign Key 제약 해결)
        // 에러가 나더라도 진행 (로그만 남김)
        console.log(`[delete-event] 🗑️ Cleaning up dependent data...`);

        try {
            const { error: favError } = await supabaseAdmin.from('event_favorites').delete().eq('event_id', eventId);
            if (favError) console.warn(`[delete-event] ⚠️ Error deleting event_favorites:`, favError.message);
            else console.log(`[delete-event] ✅ event_favorites cleaned up`);

            if (favError) console.warn(`[delete-event] ⚠️ Error deleting event_favorites:`, favError.message);
            else console.log(`[delete-event] ✅ event_favorites cleaned up`);

            // comments 테이블은 존재하지 않음 (이벤트 댓글 기능이 아직 없거나 다른 테이블 사용)
            // const { error: commentError } = await supabaseAdmin.from('comments').delete().eq('event_id', eventId);
            // if (commentError) console.warn(`[delete-event] ⚠️ Error deleting comments:`, commentError.message);
            // else console.log(`[delete-event] ✅ comments cleaned up`);
        } catch (depError) {
            console.error(`[delete-event] ⚠️ Unexpected error during dependency cleanup:`, depError);
        }

        // 4. 스토리지 파일 삭제 (Double Safety Strategy)
        // 전략: 폴더 삭제도 시도하고, 개별 파일 삭제도 무조건 시도한다. (중복 삭제는 에러가 아니므로 안전)

        // 4-A. 폴더 단위 삭제 시도
        if (eventData.storage_path) {
            console.log(`[delete-event] 📦 [Method A] Attempting folder cleanup: ${eventData.storage_path}`);
            try {
                const { data: files, error: listError } = await supabaseAdmin.storage.from('images').list(eventData.storage_path);

                if (listError) {
                    console.warn(`[delete-event] ⚠️ Method A failed (list):`, listError.message);
                } else if (files && files.length > 0) {
                    const filePaths = files.map((file) => `${eventData.storage_path}/${file.name}`);
                    console.log(`[delete-event] 🗑️ Method A removing ${files.length} files:`, filePaths);

                    const { error: removeError } = await supabaseAdmin.storage.from('images').remove(filePaths);
                    if (removeError) {
                        console.error(`[delete-event] ❌ Method A failed (remove):`, removeError.message);
                    } else {
                        console.log(`[delete-event] ✅ Method A successful`);
                    }
                } else {
                    console.log(`[delete-event] ℹ️ Method A found no files in folder.`);
                }
            } catch (folderError) {
                console.error(`[delete-event] ⚠️ Method A Unexpected Error:`, folderError);
            }
        }

        // 4-B. 개별 파일 단위 삭제 시도 (무조건 실행 - Redundancy)
        const extractPath = (url: string | null) => {
            if (!url) return null;
            try {
                if (url.includes('/images/')) {
                    // URL decoding is crucial
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

        if (imagePaths.length > 0) {
            console.log(`[delete-event] 🗑️ [Method B] Attempting unconditional individual file cleanup:`, imagePaths);
            try {
                // 이전에 폴더 삭제로 지워졌더라도, 다시 요청 보내는 것은 안전함 (Supabase/S3는 없는 파일 삭제 시 에러 없이 성공 처리하거나 무시함)
                const { error: legacyRemoveError } = await supabaseAdmin.storage.from('images').remove(imagePaths);
                if (legacyRemoveError) {
                    console.error(`[delete-event] ❌ Method B failed:`, legacyRemoveError.message);
                } else {
                    console.log(`[delete-event] ✅ Method B successful (Redundant safety check passed)`);
                }
            } catch (fileError) {
                console.error(`[delete-event] ⚠️ Method B Unexpected Error:`, fileError);
            }
        } else {
            console.log(`[delete-event] ℹ️ Method B: No individual image paths found in DB records.`);
        }

        // 5. 이벤트 최종 삭제
        console.log(`[delete-event] 💥 Finally deleting event record ${eventId} from DB...`);
        const { error: deleteError } = await supabaseAdmin.from('events').delete().eq('id', eventId);

        if (deleteError) {
            console.error(`[delete-event] ❌ CRITICAL DB DELETE ERROR for Event ${eventId}:`, deleteError.message);
            console.error(`[delete-event] Error Details:`, deleteError);
            throw deleteError;
        }

        console.log(`[delete-event] 🎉 SUCCESS: Event ${eventId} and associated resources deleted.`);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Event deleted successfully.' })
        };

    } catch (error: any) {
        console.error('[delete-event] 💣 UNEXPECTED FATAL ERROR:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: (error.message || 'Unknown server error'),
                details: error.details || null
            })
        };
    }
};
