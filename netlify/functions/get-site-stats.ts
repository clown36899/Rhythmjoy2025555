import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
    console.error('[get-site-stats] ❌ SUPABASE_SERVICE_KEY is missing!');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey!, {
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
        // 1. 캐시 조회 (metrics_cache)
        const { data: cacheData, error: cacheError } = await supabaseAdmin
            .from('metrics_cache')
            .select('value, updated_at')
            .eq('key', 'layout_summary')
            .single();

        const now = new Date();
        let resultData = null;
        let shouldUseCache = false;

        if (cacheData && cacheData.value) {
            const lastUpdated = new Date(cacheData.updated_at);
            const diffMs = now.getTime() - lastUpdated.getTime();
            // 24시간(86400000ms) 유효기간 체크
            if (diffMs < 24 * 60 * 60 * 1000) {
                shouldUseCache = true;
                resultData = cacheData.value;
            }
        }

        // 2. 캐시가 없거나 만료되었으면 재계산 (RPC 호출)
        if (!shouldUseCache) {
            console.log('[get-site-stats] Cache miss/stale. Refreshing...');
            const { data: refreshedData, error: rpcError } = await supabaseAdmin
                .rpc('refresh_site_metrics');

            if (rpcError) {
                console.error('[get-site-stats] RPC Error Detail:', JSON.stringify(rpcError, null, 2));
                throw rpcError;
            }
            resultData = refreshedData;
        } else {
            // console.log('[get-site-stats] Cache hit!');
        }

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300' // 브라우저/CDN 캐시 5분 추가
            },
            body: JSON.stringify(resultData)
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
