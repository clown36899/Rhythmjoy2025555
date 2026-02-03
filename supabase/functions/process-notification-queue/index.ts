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
                // Update status to 'processing' to prevent double-send in next run (though we likely finish before next run)
                await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'processing' })
                    .eq('id', item.id);

                const { title, body, category, payload } = item;
                const { url, userId, genre } = payload || {};

                console.log(`[Queue] Invoking send-push for Item ${item.id} (${title})`);

                // Invoke send-push-notification
                const { data, error } = await supabaseClient.functions.invoke('send-push-notification', {
                    body: {
                        title: title, // Already has formatting? No, queue has raw title.
                        body: body,
                        url: url,
                        userId: userId,
                        category: category,
                        genre: genre
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
