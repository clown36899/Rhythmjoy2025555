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
        const { title, body, url, userId } = payload;

        console.log(`[Push] Payload: userID=${userId}, title=${title}`);

        // 1. Fetch Subscriptions
        let query = supabaseClient
            .from('user_push_subscriptions')
            .select('subscription');

        if (userId && userId !== 'ALL') {
            // 특정 유저에게 발송
            console.log(`[Push] Targeted send to userId: ${userId}`);
            query = query.eq('user_id', userId);
        } else {
            // 관리자 전체(Broadcast) 발송 - 테스트 기간이므로 관리자로 한정
            console.log(`[Push] Admin broadcast initiated`);
            query = query.eq('is_admin', true);
        }

        const { data: subscriptions, error: dbError } = await query;

        if (dbError) throw new Error(`DB Error: ${dbError.message}`);

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(JSON.stringify({
                status: 'warning',
                message: 'No subscriptions found for this user.'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // 2. Configure VAPID
        const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
        const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');

        if (!vapidPublic || !vapidPrivate) {
            throw new Error("Missing VAPID keys in environment");
        }

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
                    tag: `push-${Date.now()}`, // Unique tag ensures multiple notifications show up
                    data: { url: url || '/' }
                });
                return webpush.sendNotification(subRecord.subscription, pushPayload);
            })
        );

        return new Response(JSON.stringify({
            status: 'success',
            results: results.map(r => ({
                status: r.status,
                // @ts-ignore: Accessing reason/value safely
                error: r.status === 'rejected' ? r.reason?.message : null
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
            status: 200, // Return 200 to ensure browser can read the JSON error
        });
    }
})
