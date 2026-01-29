import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { title, body, url, userId } = await req.json()

        // 1. Get subscriptions from the database
        let query = supabaseClient
            .from('user_push_subscriptions')
            .select('subscription')

        if (userId) {
            query = query.eq('user_id', userId)
        }

        const { data: subscriptions, error: dbError } = await query

        if (dbError) throw dbError
        if (!subscriptions || subscriptions.length === 0) {
            return new Response(JSON.stringify({ message: 'No subscriptions found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. Configure VAPID
        const publicVapidKey = Deno.env.get('VAPID_PUBLIC_KEY') || 'BKg5c8Ja6Ce_iEtvV4y3KqaCb8mV9f-a2ClJsy8eiBLIfOi1wlAhaidG6jPq9Va0PM10RmOvOIetYs1wSeZRDG0'
        const privateVapidKey = Deno.env.get('VAPID_PRIVATE_KEY') || 'LRCbI3LnETdC1_QXPg8LygjrYGpEl5tX9YJPHIwMiBk'

        webpush.setVapidDetails(
            'mailto:admin@swingenjoy.com',
            publicVapidKey,
            privateVapidKey
        )

        // 3. Send notifications
        const results = await Promise.allSettled(
            subscriptions.map(async (subRecord: any) => {
                const payload = JSON.stringify({
                    title,
                    body,
                    data: { url: url || '/' }
                })

                return webpush.sendNotification(subRecord.subscription, payload)
            })
        )

        return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
