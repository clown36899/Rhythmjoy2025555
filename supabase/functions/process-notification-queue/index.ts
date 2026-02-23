import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

        // VAPID Setup
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';

        if (vapidPublicKey && vapidPrivateKey) {
            webpush.setVapidDetails(
                'mailto:clown313@naver.com',
                vapidPublicKey,
                vapidPrivateKey
            );
        }

        // 1. Fetch pending items that are due
        const now = new Date().toISOString();
        const { data: pendingItems, error: fetchError } = await supabaseClient
            .from('notification_queue')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .limit(10);

        if (fetchError) throw fetchError;

        if (!pendingItems || pendingItems.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending items' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`[Queue] Processing ${pendingItems.length} items...`);

        const results = [];

        for (const item of pendingItems) {
            try {
                // [Atomic Update] 'pending' -> 'processing' (Double-check status to avoid race conditions)
                const { data: updateData, error: updateError } = await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'processing', updated_at: new Date().toISOString() })
                    .eq('id', item.id)
                    .eq('status', 'pending') // Only update if still pending
                    .select();

                // If no row updated, someone else is processing it
                if (updateError || !updateData || updateData.length === 0) {
                    console.log(`[Queue] Item ${item.id} already being processed or not found.`);
                    continue;
                }

                const { title, body, category, payload, event_id } = item;
                const { url, userId, genre, image, content, error_test } = payload || {};

                // [Debug] 고의 에러 재현 (테스트용)
                if (error_test === true) {
                    console.error(`[Queue-Test] Forcing error for Item ${item.id}`);
                    throw new Error("REPRODUCED_QUEUE_ERROR: Intentional test failure");
                }

                // 2. Fetch latest event data if event_id exists
                let finalTitle = title;
                let finalBody = body;
                let finalCategory = category;
                let finalUrl = url;
                let finalImage = image;
                let finalContent = content;
                let finalGenre = genre;

                if (event_id) {
                    const { data: ev } = await supabaseClient.from('events').select('*').eq('id', event_id).single();
                    if (ev) {
                        const isLesson = ev.category === 'class' || ev.category === 'regular' || ev.category === 'club';
                        const pushCat = isLesson ? 'class' : 'event';
                        const weekDay = ev.date ? ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][new Date(ev.date).getDay()] : '';

                        finalTitle = `${ev.title} (${pushCat === 'class' ? '강습' : '행사'})`;
                        finalBody = `${ev.date || ''} ${weekDay} | ${ev.location || '장소 미정'}`;
                        finalCategory = pushCat;
                        finalGenre = ev.genre;
                        finalImage = ev.image_thumbnail;
                        finalContent = ev.description;
                        finalUrl = `${Deno.env.get('SITE_URL') || 'https://swingenjoy.com'}/calendar?id=${ev.id}`;
                    }
                }

                console.log(`[Queue] Invoking push for Item ${item.id}`);

                // 3. Invoke send-push-notification
                const { data, error: invokeError } = await supabaseClient.functions.invoke('send-push-notification', {
                    body: {
                        title: finalTitle,
                        body: finalBody,
                        url: finalUrl,
                        userId: userId,
                        category: finalCategory,
                        genre: finalGenre,
                        image: finalImage,
                        content: finalContent
                    }
                });

                if (invokeError) throw invokeError;

                // [Atomic Update] 'processing' -> 'sent'
                await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'sent', updated_at: new Date().toISOString() })
                    .eq('id', item.id);

                results.push({ id: item.id, status: 'sent', result: data });

            } catch (err: any) {
                console.error(`[Queue Error] Item ${item.id}:`, err.message);

                // [Critical Fix] 무조건 'failed' 상태로 마킹하여 무한 루프 방지
                await supabaseClient
                    .from('notification_queue')
                    .update({
                        status: 'failed',
                        payload: { ...item.payload, last_error: err.message },
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', item.id);

                results.push({ id: item.id, status: 'failed', error: err.message });
            }
        }

        return new Response(JSON.stringify({ custom_results: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        console.error('[Fatal Queue Error]', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});

