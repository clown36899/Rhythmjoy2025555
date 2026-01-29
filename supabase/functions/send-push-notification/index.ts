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

        const targetUserIds = [...new Set(subscriptions.map((s: any) => s.user_id))];
        console.log(`[Push] Found ${subscriptions.length} devices for users: ${targetUserIds.join(', ')}`);

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
            subscriptions.map(async (subRecord: any) => {
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
