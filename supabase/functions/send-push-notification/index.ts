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
        const { title, body, url, userId, category, image, content } = payload;

        // [Fix] setVapidDetails must be called before sendNotification
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';

        if (vapidPublicKey && vapidPrivateKey) {
            webpush.setVapidDetails(
                'mailto:clown313@naver.com',
                vapidPublicKey,
                vapidPrivateKey
            );
        } else {
            console.warn('[Push] VAPID keys are missing in environment variables.');
        }

        console.log(`[Push] Starting process: userID=${userId}, category=${category}`);

        // [Debug] Check total rows visible to this function
        const { count: totalCount, error: countError } = await supabaseClient
            .from('user_push_subscriptions')
            .select('*', { count: 'exact', head: true });

        console.log(`[Push] Total subscriptions in DB (visible to admin): ${totalCount}, Error: ${countError?.message}`);

        // 1. Fetch Subscriptions
        let query = supabaseClient
            .from('user_push_subscriptions')
            .select('id, subscription, user_id, pref_events, pref_class, pref_clubs, pref_filter_tags, pref_filter_class_genres');

        if (userId && userId !== 'ALL') {
            console.log(`[Push] Targeted send to userId: ${userId}`);
            query = query.eq('user_id', userId);
        } else {
            console.log(`[Push] Broadcast initiated`);

            if (category === 'event') {
                console.log('[Push] Filtering by pref_events=true');
                query = query.eq('pref_events', true);
            } else if (category === 'class') {
                console.log('[Push] Filtering by pref_class=true');
                query = query.eq('pref_class', true);
            } else if (category === 'club') {
                console.log('[Push] Filtering by pref_clubs=true');
                query = query.eq('pref_clubs', true);
            }
        }

        const { data: subscriptions, error: dbError } = await query;

        if (dbError) throw new Error(`DB Error: ${dbError.message}`);

        console.log(`[Push] Query returned ${subscriptions?.length || 0} subscriptions.`);

        if (!subscriptions || subscriptions.length === 0) {
            console.log('[Push] No target subscriptions found in DB.');
            return new Response(JSON.stringify({
                status: 'warning',
                message: `No subscriptions found. Total in DB: ${totalCount}. Criteria: category=${category}`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // --- Client-Side Filtering for Array Intersections ---
        let targetSubscriptions = subscriptions;

        // payload.genre comes as string "A, B"
        const genreStr = typeof payload.genre === 'string' ? payload.genre : '';
        console.log(`[Push] Filtering Category="${category}", Genre="${genreStr}"`);

        if (category === 'event') {
            targetSubscriptions = subscriptions.filter((sub: any) => {
                if (!sub.pref_filter_tags || sub.pref_filter_tags.length === 0) return true;
                const userTags = sub.pref_filter_tags as string[];
                const isMatch = userTags.some((tag: string) => genreStr.includes(tag));
                return isMatch;
            });
        } else if (category === 'class') {
            targetSubscriptions = subscriptions.filter((sub: any) => {
                if (!sub.pref_filter_class_genres || sub.pref_filter_class_genres.length === 0) return true;
                const userGenres = sub.pref_filter_class_genres as string[];
                const isMatch = userGenres.some((g: string) => genreStr.includes(g));
                return isMatch;
            });
        }

        const targetUserIds = [...new Set(targetSubscriptions.map((s: any) => s.user_id))];
        console.log(`[Push] Found ${targetSubscriptions.length} devices for users: ${targetUserIds.join(', ')}`);

        // 3. Send Notifications
        const results = await Promise.allSettled(
            targetSubscriptions.map(async (subRecord: any) => {
                // 상세 내용(content)이 있으면 본문에 추가 (펼쳤을 때 표시됨)
                const finalBody = content ? `${body}\n\n${content}` : body;

                const pushPayload = JSON.stringify({
                    title: title, // 등록시간 등 부가정보 절대 포함 금지
                    body: finalBody,
                    icon: image || 'https://swingenjoy.com/logo512.png', // 이미지가 있으면 우측 이미지(아이콘)로 활용
                    image: image, // 큰 이미지(Android 배너 등)
                    tag: `push-${Date.now()}`,
                    data: { url: url || '/' }
                });

                try {
                    const res = await webpush.sendNotification(subRecord.subscription, pushPayload);
                    console.log(`[Push] Device Success: ${subRecord.user_id}`);
                    return res;
                } catch (err: any) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.warn(`[Push] Dead subscription detected (Status ${err.statusCode}). Deleting... ID: ${subRecord.id}`);
                        await supabaseClient
                            .from('user_push_subscriptions')
                            .delete()
                            .eq('id', subRecord.id);
                    } else {
                        console.error(`[Push] Device Rejection: ${subRecord.user_id} - code: ${err.statusCode}`);
                    }
                    throw err;
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
                // @ts-expect-error - r.reason might exist on rejected promise
                statusCode: r.status === 'rejected' ? r.reason?.statusCode : 200,
                // @ts-expect-error - r.reason might exist on rejected promise
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
