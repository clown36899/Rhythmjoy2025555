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
            .select('id, subscription, user_id, pref_events, pref_lessons, pref_clubs, pref_filter_tags, pref_filter_class_genres');

        if (userId && userId !== 'ALL') {
            console.log(`[Push] Targeted send to userId: ${userId}`);
            query = query.eq('user_id', userId);
        } else {
            console.log(`[Push] Admin broadcast initiated`);
            query = query.eq('is_admin', true); // Test Mode

            // Basic Category Filtering at DB Level (Optimization)
            if (category === 'event') {
                query = query.eq('pref_events', true);
            } else if (category === 'class') {
                query = query.eq('pref_lessons', true);
            } else if (category === 'club') {
                query = query.eq('pref_clubs', true);
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

        // --- Client-Side Filtering for Array Intersections ---
        let targetSubscriptions = subscriptions;

        // payload.genre comes as string "A, B"
        const genreStr = typeof payload.genre === 'string' ? payload.genre : '';
        console.log(`[Push] Filtering Category="${category}", Genre="${genreStr}"`);

        /* 
          Logic:
           - Events: Check 'pref_filter_tags'
           - Classes: Check 'pref_filter_class_genres'
           - Clubs: No filter (pref_clubs is already checked above)
        */

        if (category === 'event') {
            targetSubscriptions = subscriptions.filter((sub: any) => {
                // If tags are null/empty => Send to all who enabled events
                if (!sub.pref_filter_tags || sub.pref_filter_tags.length === 0) return true;

                // Check intersection
                const userTags = sub.pref_filter_tags as string[];
                const isMatch = userTags.some((tag: string) => genreStr.includes(tag));
                return isMatch;
            });
        } else if (category === 'class') {
            targetSubscriptions = subscriptions.filter((sub: any) => {
                // If genres are null/empty => Send to all who enabled classes
                if (!sub.pref_filter_class_genres || sub.pref_filter_class_genres.length === 0) return true;

                // Check intersection
                const userGenres = sub.pref_filter_class_genres as string[];
                const isMatch = userGenres.some((g: string) => genreStr.includes(g));
                return isMatch;
            });
        }
        // 'club' needs no extra filtering here, DB query handled pref_clubs = true.

        const targetUserIds = [...new Set(targetSubscriptions.map((s: any) => s.user_id))];
        console.log(`[Push] Found ${targetSubscriptions.length} devices for users: ${targetUserIds.join(', ')}`);

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
                    // [Garbage Collection] 410(Gone) or 404(Not Found) means the subscription is dead.
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.warn(`[Push] Dead subscription detected (Status ${err.statusCode}). Deleting... ID: ${subRecord.id}`);

                        // Lazy Delete from DB
                        const { error: delError } = await supabaseClient
                            .from('user_push_subscriptions')
                            .delete()
                            .eq('id', subRecord.id);

                        if (delError) {
                            console.error(`[Push] Failed to delete garbage record: ${delError.message}`);
                        } else {
                            console.log(`[Push] Garbage record deleted successfully: ${subRecord.id}`);
                        }
                    } else {
                        console.error(`[Push] Device Rejection: ${subRecord.user_id} - code: ${err.statusCode}, body: ${err.body}`);
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
