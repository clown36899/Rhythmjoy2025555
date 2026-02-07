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
        } else {
            console.warn('[Queue] VAPID keys missing.');
        }

        // 1. Fetch pending items that are due
        const now = new Date().toISOString();
        const { data: pendingItems, error: fetchError } = await supabaseClient
            .from('notification_queue')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .limit(10); // Batch size

        if (fetchError) throw fetchError;

        if (!pendingItems || pendingItems.length === 0) {
            console.log('[Queue] No pending notifications to send.');
            return new Response(JSON.stringify({ message: 'No pending items' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`[Queue] Processing ${pendingItems.length} items...`);

        const results = [];

        // 2. Process each item (re-use send-push-notification logic roughly)
        // Ideally, we would invoke the OTHER function, but to save cold starts/complexity, we can inline simple sending logic here.
        // OR, simply invoke 'send-push-notification' for each item. Invoking is cleaner for code reuse.

        for (const item of pendingItems) {
            try {
                // Update status to 'processing'
                await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'processing' })
                    .eq('id', item.id);

                const { title, body, category, payload, event_id } = item;
                const { url, userId, genre, image, content } = payload || {};

                // [Feature] 발송 직전 최신 데이터 동기화
                if (event_id) {
                    const { data: latestEvent, error: eventError } = await supabaseClient
                        .from('events')
                        .select('*')
                        .eq('id', event_id)
                        .single();

                    if (eventError || !latestEvent) {
                        console.log(`[Queue] Event ${event_id} not found. Canceling notification.`);
                        await supabaseClient
                            .from('notification_queue')
                            .update({ status: 'canceled' })
                            .eq('id', item.id);
                        results.push({ id: item.id, status: 'canceled' });
                        continue;
                    }

                    // 최신 데이터로 업데이트
                    const isLesson = latestEvent.category === 'class' || latestEvent.category === 'regular' || latestEvent.category === 'club';
                    const pushCategory = isLesson ? 'class' : 'event';
                    const weekDay = latestEvent.date ? ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][new Date(latestEvent.date).getDay()] : '';

                    title = `${latestEvent.title} (${pushCategory === 'class' ? '강습' : '행사'})`;
                    body = `${latestEvent.date || ''} ${weekDay} | ${latestEvent.location || '장소 미정'}`;
                    category = pushCategory;
                    genre = latestEvent.genre;
                    image = latestEvent.image_thumbnail;
                    content = latestEvent.description;
                    url = `${Deno.env.get('SITE_URL') || 'https://swingenjoy.com'}/calendar?id=${latestEvent.id}`;
                }

                console.log(`[Queue] Invoking send-push for Item ${item.id} (${title})`);

                // Invoke send-push-notification
                const { data, error } = await supabaseClient.functions.invoke('send-push-notification', {
                    body: {
                        title: title,
                        body: body,
                        url: url,
                        userId: userId,
                        category: category,
                        genre: genre,
                        image: image,
                        content: content
                    }
                });

                if (error) throw error;

                // Update status to 'sent'
                await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'sent' })
                    .eq('id', item.id);

                results.push({ id: item.id, status: 'sent', result: data });

            } catch (err: any) {
                console.error(`[Queue] Failed to process item ${item.id}:`, err);
                await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'failed', payload: { ...item.payload, error: err.message } })
                    .eq('id', item.id);
                results.push({ id: item.id, status: 'failed', error: err.message });
            }
        }

        return new Response(JSON.stringify({ custom_results: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});
