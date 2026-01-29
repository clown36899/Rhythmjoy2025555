import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

        const payload = await req.json();
        const { title, body, url, userId, category } = payload;

        console.log(`[Push] Starting process: userID=${userId}, category=${category}, title=${title}`);

        // 1. Fetch Subscriptions
        let query = supabaseClient
            .from('user_push_subscriptions')
            .select('subscription, user_id');

        if (userId && userId !== 'ALL') {
            console.log(`[Push] Targeted send to userId: ${userId}`);
            query = query.eq('user_id', userId);
        } else {
            console.log(`[Push] Admin broadcast initiated`);
            query = query.eq('is_admin', true);

            if (category === 'event') {
                query = query.eq('pref_events', true);
            } else if (category === 'lesson') {
                query = query.eq('pref_lessons', true);
            }
        }

        const { data: subscriptions, error: dbError } = await query;

        if (dbError) throw new Error(`DB Error: ${dbError.message}`);

        if (!subscriptions || subscriptions.length === 0) {
            console.log('[Push] No target subscriptions found in DB.');
            return new Response(JSON.stringify({
                status: 'warning',
                message: 'No subscriptions found in database for the given criteria.'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // [New] Filter by tags (Client-side filtering because Supabase doesn't support complex array intersections easily in one query without RPC)
        // We fetch all users who want 'events', then filter out those whose tags don't match.
        // For 'lesson', we just send to all (pref_lessons=true), unless we add logic later.

        let targetSubscriptions = subscriptions;

        if (category === 'event') {
            // eventGenre를 파싱 (e.g. "파티,워크샵" -> ['파티', '워크샵'])
            // payload에서 genre를 받아와야 함.
            const eventGenreBytes = payload.genre || ''; // payload에 genre 추가 필요
            // 만약 payload에 genre가 없으면 분류 불가 -> 기본적으로 보냄? or 기타?
            // "기타"로 취급하거나, 모든 태그 구독자에게 보낼 수는 없음.
            // 작성된 이벤트의 장르 문자열
            const eventGenreStr = typeof eventGenreBytes === 'string' ? eventGenreBytes : '';

            console.log(`[Push] Event filtering: Genre="${eventGenreStr}"`);

            targetSubscriptions = subscriptions.filter((sub: any) => {
                // 1. 태그 설정이 없거나 null이면 "전체 수신"
                if (!sub.pref_filter_tags || sub.pref_filter_tags.length === 0) return true;

                // 2. 태그 설정이 있으면, 이벤트 장르와 교집합이 있는지 확인
                // 이벤트 장르가 "파티,워크샵" 이면 "파티" 포함 OR "워크샵" 포함 여부 확인
                const userTags = sub.pref_filter_tags as string[];

                // 이벤트 장르 문자열이 사용자 태그 중 하나라도 포함하는지 확인 (Substring match)
                // 예: 사용자가 '파티' 구독 -> eventGenre "파티,워크샵" -> 매칭됨
                // 예: 사용자가 '대회' 구독 -> eventGenre "파티" -> 매칭안됨
                const isMatch = userTags.some(tag => eventGenreStr.includes(tag));

                // "기타" 태그 처리: 
                // 사용자가 "기타"를 구독했고, 이벤트 장르가 "기타"이거나, 
                // 혹은 우리가 정의한 4가지(파티,대회,워크샵,기타) 키워드가 하나도 없는 경우?
                // -> User Request: "4개 외엔 없음". "팀원모집"은? 
                // -> Simple logic: Just check explicit string inclusion.

                return isMatch;
            });
        }

        const targetUserIds = [...new Set(targetSubscriptions.map((s: any) => s.user_id))];
        console.log(`[Push] Found ${targetSubscriptions.length} devices for users: ${targetUserIds.join(', ')}`);

        // 2. Configure VAPID
        const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
        const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');

        if (!vapidPublic || !vapidPrivate) {
            throw new Error("Missing VAPID keys in Supabase secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)");
        }

        // Key Hint for debugging
        console.log(`[Push] Using VAPID Public Key Hint: ${vapidPublic.substring(0, 5)}...${vapidPublic.slice(-5)}`);

        webpush.setVapidDetails(
            'mailto:admin@swingenjoy.com',
            vapidPublic,
            vapidPrivate
        );

        // 3. Send Notifications
        const timestamp = new Date().toLocaleTimeString('ko-KR');
        const results = await Promise.allSettled(
            targetSubscriptions.map(async (subRecord: any) => {
                const pushPayload = JSON.stringify({
                    title: `${title} (${timestamp})`,
                    body,
                    tag: `push-${Date.now()}`,
                    data: { url: url || '/' }
                });

                try {
                    const res = await webpush.sendNotification(subRecord.subscription, pushPayload);
                    console.log(`[Push] Device Success: ${subRecord.user_id}`);
                    return res;
                } catch (err: any) {
                    console.error(`[Push] Device Rejection: ${subRecord.user_id} - code: ${err.statusCode}, body: ${err.body}`);
                    throw err; // Re-throw to be captured by Promise.allSettled
                }
            })
        );

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failureCount = results.filter(r => r.status === 'rejected').length;

        console.log(`[Push] Batch complete: ${successCount} success, ${failureCount} failure`);

        return new Response(JSON.stringify({
            status: 'success',
            targetUsers: targetUserIds,
            summary: { success: successCount, failure: failureCount },
            results: results.map(r => ({
                status: r.status,
                // @ts-ignore
                statusCode: r.status === 'rejected' ? r.reason?.statusCode : 200,
                // @ts-ignore
                error: r.status === 'rejected' ? (r.reason?.body || r.reason?.message) : null
            }))
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err: any) {
        console.error(`[Push Fatal] ${err.message}`);
        return new Response(JSON.stringify({
            status: 'error',
            message: err.message,
            stack: err.stack
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }
});
