import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const adminEmailEnv = process.env.VITE_ADMIN_EMAIL;
const DELETE_EVENT_DEBUG = process.env.DELETE_EVENT_DEBUG === 'true';
const deleteEventDebug = (...args: unknown[]) => {
    if (DELETE_EVENT_DEBUG) console.log(...args);
};

const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY || '';
const supabaseAdmins = new Map<string, SupabaseClient>();

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function isLocalHost(value?: string | null) {
    if (!value) return false;
    return /(^|\/\/|\.)localhost(?::|\/|$)|(^|\/\/)127\.0\.0\.1(?::|\/|$)|(^|\/\/)0\.0\.0\.0(?::|\/|$)/i.test(value);
}

function isLocalRequest(event: Parameters<Handler>[0]) {
    if (process.env.VITE_FORCE_PROD_SUPABASE === 'true') return false;
    const host = event.headers.host || event.headers.Host || '';
    const origin = event.headers.origin || event.headers.Origin || '';
    const referer = event.headers.referer || event.headers.Referer || '';
    return [host, origin, referer].some((value) => isLocalHost(String(value || '')));
}

function deleteEventDiagnostic(event: Parameters<Handler>[0], ...args: unknown[]) {
    if (DELETE_EVENT_DEBUG || isLocalRequest(event)) {
        console.log(...args);
    }
}

function getSupabaseAdmin(event: Parameters<Handler>[0]) {
    const useLocalSupabase = isLocalRequest(event);
    const supabaseUrl = useLocalSupabase
        ? LOCAL_SUPABASE_URL
        : process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = useLocalSupabase
        ? LOCAL_SUPABASE_SERVICE_KEY
        : process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase 관리자 환경변수가 설정되지 않았습니다.');
    }

    const cacheKey = `${supabaseUrl}:${supabaseServiceKey.slice(0, 12)}`;
    const cached = supabaseAdmins.get(cacheKey);
    if (cached) return cached;

    const client = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    supabaseAdmins.set(cacheKey, client);
    return client;
}

function getAuthHeader(event: Parameters<Handler>[0]) {
    return event.headers.authorization || event.headers.Authorization || '';
}

function getBearerToken(event: Parameters<Handler>[0]) {
    const match = String(getAuthHeader(event)).match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || '';
}

async function isAdminUser(supabaseAdmin: SupabaseClient, user: User) {
    const metadataAdmin = user.app_metadata?.is_admin === true ||
        user.app_metadata?.role === 'admin' ||
        Boolean(adminEmailEnv && user.email === adminEmailEnv);

    if (metadataAdmin) return true;

    const { data: adminRow, error: adminError } = await supabaseAdmin
        .from('board_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (adminError) {
        console.warn('[delete-event] 관리자 권한 확인 실패:', adminError.message);
        return false;
    }

    return Boolean(adminRow?.user_id);
}

function getEventIdCandidates(eventId: unknown) {
    const strippedId = String(eventId || '').replace(/^social-/, '').trim();
    const candidates = new Set<string>();
    if (strippedId) candidates.add(strippedId);

    const numericId = Number(strippedId);
    if (Number.isFinite(numericId) && numericId > 10000000) {
        candidates.add(String(numericId - 10000000));
    }

    return [...candidates];
}

function extractImageStoragePath(url: string | null) {
    if (!url) return null;
    try {
        if (!url.includes('/images/')) return null;
        return decodeURIComponent(url.split('/images/')[1]?.split('?')[0] || '');
    } catch {
        return null;
    }
}

async function withTimeout<T>(
    event: Parameters<Handler>[0],
    label: string,
    operation: () => Promise<T>,
    timeoutMs = 1500
): Promise<T | null> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
            console.warn(`[delete-event] ⚠️ ${label} timed out after ${timeoutMs}ms`);
            resolve(null);
        }, timeoutMs);
    });

    try {
        return await Promise.race([
            operation().catch((error) => {
                console.error(`[delete-event] ⚠️ ${label} failed:`, error?.message || error);
                return null;
            }),
            timeoutPromise,
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function cleanupEventImagesBestEffort(
    event: Parameters<Handler>[0],
    supabaseAdmin: SupabaseClient,
    eventData: {
        storage_path: string | null;
        image: string | null;
        image_thumbnail: string | null;
        image_medium: string | null;
        image_full: string | null;
    },
) {
    const paths = new Set<string>();

    for (const path of [eventData.image, eventData.image_thumbnail, eventData.image_medium, eventData.image_full]
        .map(extractImageStoragePath)
        .filter((path): path is string => Boolean(path))) {
        paths.add(path);
    }

    if (eventData.storage_path) {
        const listResult = await withTimeout(event, 'storage folder list', () => (
            supabaseAdmin.storage.from('images').list(eventData.storage_path as string)
        ), 900);

        if (listResult?.error) {
            console.warn(`[delete-event] ⚠️ storage folder list returned error:`, listResult.error.message);
        } else if (listResult?.data?.length) {
            for (const file of listResult.data) {
                paths.add(`${eventData.storage_path}/${file.name}`);
            }
        }
    }

    if (paths.size === 0) {
        deleteEventDebug(`[delete-event] No storage files to clean up`);
        return { attempted: false, count: 0 };
    }

    const filePaths = [...paths];
    const removeResult = await withTimeout(event, 'storage file remove', () => (
        supabaseAdmin.storage.from('images').remove(filePaths)
    ), 1500);

    if (removeResult?.error) {
        console.warn(`[delete-event] ⚠️ storage file remove returned error:`, removeResult.error.message);
        return { attempted: true, count: filePaths.length, ok: false };
    }

    return { attempted: true, count: filePaths.length, ok: Boolean(removeResult) };
}

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        const supabaseAdmin = getSupabaseAdmin(event);
        const { eventId, password } = JSON.parse(event.body || '{}');
        const eventIdCandidates = getEventIdCandidates(eventId);
        deleteEventDiagnostic(event, `[delete-event] Request received`, {
            eventId,
            candidates: eventIdCandidates,
            localRequest: isLocalRequest(event),
            hasAuth: Boolean(getAuthHeader(event)),
        });

        if (eventIdCandidates.length === 0) {
            console.error('[delete-event] Missing eventId in request body');
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Event ID is required.' })
            };
        }

        // 1. DB에서 이벤트 정보 조회
        let resolvedEventId = '';
        let eventData: {
            password: string | null;
            storage_path: string | null;
            image: string | null;
            image_thumbnail: string | null;
            image_medium: string | null;
            image_full: string | null;
            user_id: string | null;
            title: string | null;
        } | null = null;

        for (const candidateId of eventIdCandidates) {
            deleteEventDebug(`[delete-event] Fetching event details`, { eventId: candidateId });
            const { data, error: fetchError } = await supabaseAdmin
                .from('events')
                .select('password, storage_path, image, image_thumbnail, image_medium, image_full, user_id, title')
                .eq('id', candidateId)
                .maybeSingle();

            if (fetchError) {
                console.error(`[delete-event] ❌ Event lookup failed:`, { eventId: candidateId, message: fetchError.message });
                throw fetchError;
            }

            if (data) {
                resolvedEventId = candidateId;
                eventData = data;
                break;
            }
        }

        if (!eventData) {
            deleteEventDiagnostic(event, `[delete-event] Event not found`, { requestedEventId: eventId, candidates: eventIdCandidates });
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Event not found.', requestedEventId: eventId, candidates: eventIdCandidates })
            };
        }

        deleteEventDiagnostic(event, `[delete-event] Event found`, {
            requestedEventId: eventId,
            resolvedEventId,
            title: eventData.title,
            hasStoragePath: Boolean(eventData.storage_path),
            userId: eventData.user_id,
        });

        // 2. 권한 확인
        let isAuthorized = false;
        let authReason = "";
        const authHeader = getAuthHeader(event);

        if (authHeader) {
            deleteEventDebug(`[delete-event] Auth header present, verifying token`);
            const token = getBearerToken(event);
            const { data: { user }, error: userError } = token
                ? await supabaseAdmin.auth.getUser(token)
                : { data: { user: null }, error: new Error('Invalid authorization header') };

            if (userError) {
                console.error(`[delete-event] ❌ User verification failed:`, userError.message);
            }

            if (user) {
                deleteEventDebug(`[delete-event] Authenticated user`, { userId: user.id, email: user.email });

                // 관리자 권한 확인
                const isAdmin = await isAdminUser(supabaseAdmin, user);

                if (isAdmin) {
                    deleteEventDebug(`[delete-event] Authorized as admin`);
                    isAuthorized = true;
                    authReason = "Admin Privileges";
                }

                if (eventData.user_id && user.id === eventData.user_id) {
                    deleteEventDebug(`[delete-event] Authorized as owner`);
                    isAuthorized = true;
                    authReason = "Resource Owner";
                }
            }
        }

        // 비밀번호 확인 (비로그인/대리 삭제용)
        if (!isAuthorized && eventData.password) {
            deleteEventDebug(`[delete-event] Checking password authorization`);
            if (eventData.password === password) {
                deleteEventDebug(`[delete-event] Authorized via password`);
                isAuthorized = true;
                authReason = "Valid Password";
            } else {
                console.warn(`[delete-event] Password mismatch for event ${resolvedEventId}.`);
            }
        }

        if (!isAuthorized) {
            console.warn(`[delete-event] 🚫 Unauthorized deletion attempt for Event ${resolvedEventId} (User: ${authHeader ? 'ID Found' : 'No Header'})`);
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized.' })
            };
        }

        deleteEventDiagnostic(event, `[delete-event] Starting deletion process`, { requestedEventId: eventId, resolvedEventId, authReason });

        // 3. 종속 데이터 삭제 (Foreign Key 제약 해결)
        // 에러가 나더라도 진행 (로그만 남김)
        deleteEventDebug(`[delete-event] Cleaning up dependent data`, { eventId: resolvedEventId });

        try {
            const { error: favError } = await supabaseAdmin.from('event_favorites').delete().eq('event_id', resolvedEventId);
            if (favError) console.warn(`[delete-event] ⚠️ Error deleting event_favorites:`, favError.message);
            else deleteEventDebug(`[delete-event] event_favorites cleaned up`);

            // comments 테이블은 존재하지 않음 (이벤트 댓글 기능이 아직 없거나 다른 테이블 사용)
            // const { error: commentError } = await supabaseAdmin.from('comments').delete().eq('event_id', eventId);
            // if (commentError) console.warn(`[delete-event] ⚠️ Error deleting comments:`, commentError.message);
            // else console.error(`[delete-event] ✅ comments cleaned up`);
        } catch (depError) {
            console.error(`[delete-event] ⚠️ Unexpected error during dependency cleanup:`, depError);
        }

        // 4. 이벤트 최종 삭제
        // UI 입장에서는 DB row 삭제가 완료 기준이다. 스토리지 정리는 아래에서 짧게 best-effort로만 처리한다.
        deleteEventDebug(`[delete-event] Deleting event row`, { eventId: resolvedEventId });
        const { error: deleteError } = await supabaseAdmin.from('events').delete().eq('id', resolvedEventId);

        if (deleteError) {
            console.error(`[delete-event] ❌ CRITICAL DB DELETE ERROR for Event ${resolvedEventId}:`, deleteError.message);
            console.error(`[delete-event] Error Details:`, deleteError);
            throw deleteError;
        }

        // 5. 스토리지 파일 삭제는 성공 응답을 지연시키지 않도록 제한 시간을 둔다.
        const storageCleanup = await cleanupEventImagesBestEffort(event, supabaseAdmin, eventData);

        deleteEventDiagnostic(event, `[delete-event] Success`, { requestedEventId: eventId, resolvedEventId, storageCleanup });
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Event deleted successfully.', eventId: resolvedEventId, storageCleanup })
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
