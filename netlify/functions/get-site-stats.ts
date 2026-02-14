import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        // 1. 회원 수 집계 (board_users)
        const { count: memberCount, error: memberError } = await supabaseAdmin
            .from('board_users')
            .select('*', { count: 'exact', head: true });

        if (memberError) throw memberError;

        // 2. PWA 유니크 설치 수 집계 (회원 UID 기준)
        const { data: pwaData, error: pwaError } = await supabaseAdmin
            .from('pwa_installs')
            .select('user_id')
            .not('user_id', 'is', null);

        if (pwaError) throw pwaError;
        const pwaCount = pwaData ? new Set(pwaData.map(d => d.user_id).filter(Boolean)).size : 0;

        // 3. 푸시 유니크 구독 수 집계 (회원 UID 기준)
        const { data: pushData, error: pushError } = await supabaseAdmin
            .from('user_push_subscriptions')
            .select('user_id')
            .not('user_id', 'is', null);

        if (pushError) throw pushError;
        const pushCount = pushData ? new Set(pushData.map(d => d.user_id).filter(Boolean)).size : 0;

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60' // 1분 캐싱 허용
            },
            body: JSON.stringify({
                memberCount: Number(memberCount || 0),
                pwaCount: Number(pwaCount || 0),
                pushCount: Number(pushCount || 0)
            })
        };

    } catch (error: any) {
        console.error('[get-site-stats] Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message || 'Internal Server Error' })
        };
    }
};
