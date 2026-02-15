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
            if (diffMs < 24 * 60 * 60 * 1000) {
                console.log('[get-site-stats] ⚡ Cache Hit!');
                shouldUseCache = true;
                resultData = cacheData.value;
            }
        }

        if (!shouldUseCache) {
            const { data: liveMetrics } = await supabaseAdmin
                .from('site_stats_index')
                .select('metric_type, val')
                .in('metric_type', ['user_count', 'pwa_count', 'push_count'])
                .order('created_at', { ascending: false })
                .limit(3);

            const summaryStats = {
                memberCount: Number(liveMetrics?.find(m => m.metric_type === 'user_count')?.val || 0),
                pwaCount: Number(liveMetrics?.find(m => m.metric_type === 'pwa_count')?.val || 0),
                pushCount: Number(liveMetrics?.find(m => m.metric_type === 'push_count')?.val || 0),
                calculatedAt: now.toISOString()
            };

            const { data: eventMetrics } = await supabaseAdmin
                .from('site_stats_index')
                .select('metric_type, dim_cat, dim_genre, ref_date, val')
                .in('metric_type', ['act_count', 'reg_count']);

            const monthlyMap: any = {};
            const weeklyMap: any = {};
            const genreMap: any = {};
            let totalItems = 0;

            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const monthlyWeeklyMap: any = {};

            const EXCLUDE_KEYWORDS = ['워크샵', '라이브밴드', '파티', '대회', '행사'];

            eventMetrics?.forEach(row => {
                const date = new Date(row.ref_date);
                const month = row.ref_date.substring(0, 7);
                const dow = date.getUTCDay();
                const val = Number(row.val);

                if (row.metric_type === 'act_count') {
                    totalItems += val;

                    if (!monthlyMap[month]) {
                        monthlyMap[month] = { month, classes: 0, socials: 0, clubs: 0, events: 0, registrations: 0, total: 0 };
                    }
                    monthlyMap[month].total += val;
                    if (row.dim_cat === 'class') monthlyMap[month].classes += val;
                    else if (row.dim_cat === 'social') monthlyMap[month].socials += val;
                    else monthlyMap[month].events += val;

                    if (row.dim_genre && row.dim_genre !== '기타') {
                        const rawGenres = row.dim_genre.split(',')
                            .map((g: string) => g.trim())
                            .filter((g: string) => g && !EXCLUDE_KEYWORDS.some(ex => g.includes(ex)));

                        if (rawGenres.length > 0) {
                            const weightPerGenre = val / rawGenres.length;
                            rawGenres.forEach((g: string) => {
                                const finalG = g === '정규강습' ? '동호회 정규강습' : g;
                                if (!weeklyMap[dow]) {
                                    weeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                                }
                                weeklyMap[dow].genres[finalG] = (weeklyMap[dow].genres[finalG] || 0) + weightPerGenre;
                                genreMap[finalG] = (genreMap[finalG] || 0) + weightPerGenre;

                                if (row.ref_date >= oneMonthAgo) {
                                    if (!monthlyWeeklyMap[dow]) {
                                        monthlyWeeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                                    }
                                    monthlyWeeklyMap[dow].genres[finalG] = (monthlyWeeklyMap[dow].genres[finalG] || 0) + weightPerGenre;
                                }
                            });
                        }
                    }

                    if (!weeklyMap[dow]) {
                        weeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                    }
                    weeklyMap[dow].count += val;
                    if (row.dim_cat === 'class') weeklyMap[dow].classes += val;
                    else if (row.dim_cat === 'social') weeklyMap[dow].socials += val;
                    else weeklyMap[dow].events += val;

                    if (row.ref_date >= oneMonthAgo) {
                        if (!monthlyWeeklyMap[dow]) {
                            monthlyWeeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                        }
                        monthlyWeeklyMap[dow].count += val;
                        if (row.dim_cat === 'class') monthlyWeeklyMap[dow].classes += val;
                        else if (row.dim_cat === 'social') monthlyWeeklyMap[dow].socials += val;
                        else monthlyWeeklyMap[dow].events += val;
                    }
                } else if (row.metric_type === 'reg_count') {
                    if (!monthlyMap[month]) {
                        monthlyMap[month] = { month, classes: 0, socials: 0, clubs: 0, events: 0, registrations: 0, total: 0 };
                    }
                    monthlyMap[month].registrations += val;
                }
            });

            const monthly = Object.values(monthlyMap).map((m: any) => {
                const [year, monthNum] = m.month.split('-').map(Number);
                const isCurrentMonth = year === now.getFullYear() && (monthNum - 1) === now.getMonth();
                const daysInMonth = isCurrentMonth ? now.getDate() : new Date(year, monthNum, 0).getDate();
                return { ...m, dailyAvg: Number((m.total / (daysInMonth || 1)).toFixed(1)) };
            }).sort((a: any, b: any) => a.month.localeCompare(b.month));

            const topGenresList = Object.entries(genreMap)
                .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
                .slice(0, 20)
                .map(e => e[0]);

            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const dowOrder: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 7 };
            const PREFERRED_ORDER = ['린디합', '발보아', '블루스', '솔로재즈', '동호회 정규강습', '팀원모집', '지터벅', '샤그', '탭댄스', '웨스트코스트스윙', '슬로우린디', '버번'];

            const getSortedBreakdown = (genresMap: any) => {
                const names = Object.keys(genresMap).filter(name => genresMap[name] > 0);
                return names.sort((a, b) => {
                    const idxA = PREFERRED_ORDER.indexOf(a);
                    const idxB = PREFERRED_ORDER.indexOf(b);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    const gIdxA = topGenresList.indexOf(a);
                    const gIdxB = topGenresList.indexOf(b);
                    if (gIdxA !== -1 && gIdxB !== -1) return gIdxA - gIdxB;
                    return a.localeCompare(b);
                }).map(name => ({ name, count: Number(genresMap[name].toFixed(1)) }));
            };

            const totalWeekly = [0, 1, 2, 3, 4, 5, 6].map(dow => {
                const w = weeklyMap[dow] || { dow, count: 0, classes: 0, events: 0, socials: 0, clubs: 0, genres: {} };
                const genreBreakdown = getSortedBreakdown(w.genres);
                return {
                    day: days[dow],
                    count: Number(w.count.toFixed(1)),
                    typeBreakdown: [
                        { name: '강습', count: w.classes },
                        { name: '행사', count: w.events },
                        { name: '동호회 이벤트+소셜', count: (w.socials || 0) + (w.clubs || 0) }
                    ],
                    genreBreakdown,
                    topGenre: genreBreakdown[0]?.name || '-',
                    items: []
                };
            }).sort((a, b) => (dowOrder[a.day] || 0) - (dowOrder[b.day] || 0));

            const monthlyWeekly = [0, 1, 2, 3, 4, 5, 6].map(dow => {
                const w = monthlyWeeklyMap[dow] || { dow, count: 0, classes: 0, events: 0, socials: 0, clubs: 0, genres: {} };
                const genreBreakdown = getSortedBreakdown(w.genres);
                return {
                    day: days[dow],
                    count: Number(w.count.toFixed(1)),
                    typeBreakdown: [
                        { name: '강습', count: w.classes },
                        { name: '행사', count: w.events },
                        { name: '동호회 이벤트+소셜', count: (w.socials || 0) + (w.clubs || 0) }
                    ],
                    genreBreakdown,
                    items: []
                };
            }).sort((a, b) => (dowOrder[a.day] || 0) - (dowOrder[b.day] || 0));

            const currentMonthKey = now.toISOString().substring(0, 7);
            const currentMonthData: any = monthlyMap[currentMonthKey];
            const dailyAverage = currentMonthData ? Number((currentMonthData.total / now.getDate()).toFixed(1)) : 0;

            resultData = {
                summary: { ...summaryStats, totalItems, dailyAverage, topDay: [...totalWeekly].sort((a, b) => b.count - a.count)[0]?.day || '-' },
                monthly,
                totalWeekly,
                monthlyWeekly,
                topGenresList
            };

            await supabaseAdmin.from('metrics_cache').upsert({
                key: 'scene_analytics',
                value: resultData,
                updated_at: now.toISOString()
            });
        }

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
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message || 'Internal Server Error' })
        };
    }
};
