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
        // 1. 캐시 조회 (metrics_cache - scene_analytics key contains full data)
        const { data: cacheData, error: cacheError } = await supabaseAdmin
            .from('metrics_cache')
            .select('value, updated_at')
            .eq('key', 'scene_analytics')
            .single();

        const now = new Date();
        const refreshParam = event.queryStringParameters?.refresh === 'true';
        console.log(`[get-site-stats] 📥 Request received. Refresh Param: ${refreshParam}`);

        let resultData = null;
        let shouldUseCache = false;

        if (cacheData && cacheData.value && !refreshParam) {
            const lastUpdated = new Date(cacheData.updated_at);
            const diffMs = now.getTime() - lastUpdated.getTime();
            // 24시간 유효기간
            if (diffMs < 24 * 60 * 60 * 1000) {
                console.log('[get-site-stats] ⚡ Cache Hit! Serving cached data.');
                shouldUseCache = true;
                resultData = cacheData.value;
            }
        }

        // 2. 캐시가 없거나 만료되었으면 재계산 (인덱스 테이블 조회)
        if (!shouldUseCache) {
            console.log(refreshParam ? '[get-site-stats] 🔄 Manual Refresh Triggered. Bypassing cache...' : '[get-site-stats] ⌛ Cache miss/stale. Querying index...');

            // A. 라이브 지표 (회원, PWA, 푸시) - 인덱스 테이블의 최신 snapshot 사용
            const { data: liveMetrics, error: liveErr } = await supabaseAdmin
                .from('site_stats_index')
                .select('metric_type, val')
                .in('metric_type', ['user_count', 'pwa_count', 'push_count'])
                .order('created_at', { ascending: false })
                .limit(3);

            if (liveErr) console.error('[get-site-stats] ❌ Live Metrics Error:', liveErr);

            const summaryStats = {
                memberCount: Number(liveMetrics?.find(m => m.metric_type === 'user_count')?.val || 0),
                pwaCount: Number(liveMetrics?.find(m => m.metric_type === 'pwa_count')?.val || 0),
                pushCount: Number(liveMetrics?.find(m => m.metric_type === 'push_count')?.val || 0),
                calculatedAt: now.toISOString()
            };

            // B. 이벤트 지표 합산 (전체 기간)
            const { data: eventMetrics } = await supabaseAdmin
                .from('site_stats_index')
                .select('metric_type, dim_cat, dim_genre, ref_date, val')
                .in('metric_type', ['act_count', 'reg_count']);

            // 프론트엔드 SwingSceneStats가 기대하는 구조로 재조합
            // 1) 월별 추이 (monthly)
            const monthlyMap: any = {};
            // 2) 요일별 분포 (totalWeekly)
            const weeklyMap: any = {};
            // 3) 장르별 순위 (topGenresList)
            const genreMap: any = {};

            let totalItems = 0;

            eventMetrics?.forEach(row => {
                const date = new Date(row.ref_date);
                const month = row.ref_date.substring(0, 7); // YYYY-MM
                const dow = date.getUTCDay();
                const val = Number(row.val);

                if (row.metric_type === 'act_count') {
                    totalItems += val;

                    // Monthly
                    if (!monthlyMap[month]) {
                        monthlyMap[month] = {
                            month, classes: 0, socials: 0, clubs: 0, events: 0,
                            registrations: 0, total: 0, dailyAvg: 0
                        };
                    }
                    monthlyMap[month].total += val;
                    if (row.dim_cat === 'class') monthlyMap[month].classes += val;
                    else if (row.dim_cat === 'social') monthlyMap[month].socials += val;
                    else monthlyMap[month].events += val;

                    // Weekly
                    if (!weeklyMap[dow]) {
                        weeklyMap[dow] = {
                            dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0,
                            genres: {} as any
                        };
                    }
                    weeklyMap[dow].count += val;
                    if (row.dim_cat === 'class') weeklyMap[dow].classes += val;
                    else if (row.dim_cat === 'social') weeklyMap[dow].socials += val;
                    else weeklyMap[dow].events += val;

                    if (row.dim_genre && row.dim_genre !== '기타') {
                        weeklyMap[dow].genres[row.dim_genre] = (weeklyMap[dow].genres[row.dim_genre] || 0) + val;
                        genreMap[row.dim_genre] = (genreMap[row.dim_genre] || 0) + val;
                    }
                } else if (row.metric_type === 'reg_count') {
                    if (!monthlyMap[month]) {
                        monthlyMap[month] = {
                            month, classes: 0, socials: 0, clubs: 0, events: 0,
                            registrations: 0, total: 0, dailyAvg: 0
                        };
                    }
                    monthlyMap[month].registrations += val;
                }
            });

            // 포맷팅 및 월별 일평균 계산
            const monthly = Object.values(monthlyMap).map((m: any) => {
                const [year, monthNum] = m.month.split('-').map(Number);
                const isCurrentMonth = year === now.getFullYear() && (monthNum - 1) === now.getMonth();
                const daysInMonth = isCurrentMonth ? now.getDate() : new Date(year, monthNum, 0).getDate();
                return {
                    ...m,
                    dailyAvg: Number((m.total / (daysInMonth || 1)).toFixed(1))
                };
            }).sort((a: any, b: any) => a.month.localeCompare(b.month));

            const topGenresList = Object.entries(genreMap)
                .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
                .slice(0, 20)
                .map(e => e[0]);

            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const totalWeekly = [0, 1, 2, 3, 4, 5, 6].map(dow => {
                const w = weeklyMap[dow] || { dow, count: 0, classes: 0, events: 0, socials: 0, clubs: 0, genres: {} };
                const genreBreakdown = Object.entries(w.genres)
                    .map(([name, count]) => ({ name, count: count as number }))
                    .sort((a, b) => b.count - a.count);

                return {
                    day: days[dow],
                    count: w.count,
                    typeBreakdown: [
                        { name: '강습', count: w.classes },
                        { name: '행사', count: w.events },
                        { name: '동호회 이벤트+소셜', count: (w.socials || 0) + (w.clubs || 0) }
                    ],
                    genreBreakdown: genreBreakdown.slice(0, 8),
                    topGenre: genreBreakdown[0]?.name || '-',
                    items: []
                };
            }).sort((a, b) => {
                const order: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 7 };
                return (order[a.day] || 0) - (order[b.day] || 0);
            });

            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const monthlyWeeklyMap: any = {};

            eventMetrics?.forEach(row => {
                const date = new Date(row.ref_date);
                const dow = date.getUTCDay();
                const val = Number(row.val);
                if (row.metric_type === 'act_count' && row.ref_date >= oneMonthAgo) {
                    if (!monthlyWeeklyMap[dow]) {
                        monthlyWeeklyMap[dow] = {
                            dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0
                        };
                    }
                    monthlyWeeklyMap[dow].count += val;
                    if (row.dim_cat === 'class') monthlyWeeklyMap[dow].classes += val;
                    else if (row.dim_cat === 'social') monthlyWeeklyMap[dow].socials += val;
                    else monthlyWeeklyMap[dow].events += val;
                }
            });

            const monthlyWeekly = [0, 1, 2, 3, 4, 5, 6].map(dow => {
                const w = monthlyWeeklyMap[dow] || { dow, count: 0, classes: 0, events: 0, socials: 0, clubs: 0 };
                return {
                    day: days[dow],
                    count: w.count,
                    typeBreakdown: [
                        { name: '강습', count: w.classes },
                        { name: '행사', count: w.events },
                        { name: '동호회 이벤트+소셜', count: (w.socials || 0) + (w.clubs || 0) }
                    ],
                    items: []
                };
            }).sort((a, b) => {
                const order: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 7 };
                return (order[a.day] || 0) - (order[b.day] || 0);
            });

            const currentMonthKey = now.toISOString().substring(0, 7);
            const currentMonthData: any = monthlyMap[currentMonthKey];
            const daysPassed = now.getDate();
            const dailyAverage = currentMonthData ? Number((currentMonthData.total / daysPassed).toFixed(1)) : 0;

            resultData = {
                summary: { ...summaryStats, totalItems, dailyAverage, topDay: [...totalWeekly].sort((a, b) => b.count - a.count)[0]?.day || '-' },
                monthly,
                totalWeekly,
                monthlyWeekly,
                topGenresList
            };

            // 캐시 업데이트
            await supabaseAdmin.from('metrics_cache').upsert({
                key: 'scene_analytics',
                value: resultData,
                updated_at: now.toISOString()
            });
        }

        // 3. 리턴 구조 조정 (SideDrawer 호환성 + SwingSceneStats 필요 데이터 포함)
        const finalBody = {
            ...(resultData.summary || {}),
            summary: resultData.summary || {},
            monthly: resultData.monthly || [],
            totalWeekly: resultData.totalWeekly || [],
            monthlyWeekly: resultData.monthlyWeekly || [],
            topGenresList: resultData.topGenresList || []
        };

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300'
            },
            body: JSON.stringify(finalBody)
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
