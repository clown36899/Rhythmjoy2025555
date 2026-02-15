import { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default async (req: Request) => {
    const now = new Date();
    console.log(`[cron-refresh-stats] 🚀 Scheduled refresh started at ${now.toISOString()}`);

    try {
        const { error } = await supabaseAdmin.rpc('refresh_site_stats_index');
        if (error) throw error;

        console.log('[cron-refresh-stats] ✅ Statistics index refreshed successfully.');

        // 캐시도 함께 무효화 (또는 강제 갱신)
        // 여기서는 get-site-stats가 캐시 미스 시 인덱스를 조회하므로 캐시를 지우는 것이 좋음
        const { error: cacheError } = await supabaseAdmin
            .from('metrics_cache')
            .delete()
            .eq('key', 'scene_analytics');

        if (cacheError) console.warn('[cron-refresh-stats] Warning: Failed to clear cache:', cacheError);

        return new Response(JSON.stringify({ message: "Success" }), { status: 200 });
    } catch (error: any) {
        console.error('[cron-refresh-stats] ❌ Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// 매일 한국 시간 새벽 5시 (UTC 20:00) 에 실행
export const config: Config = {
    schedule: "0 20 * * *"
};
