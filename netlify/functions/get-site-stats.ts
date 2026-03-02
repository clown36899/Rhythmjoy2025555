import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

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
        const CACHE_KEY = 'scene_analytics_v3'; // [FIX] New key to avoid any stale data
        const { data: cacheData } = await supabaseAdmin
            .from('metrics_cache')
            .select('value, updated_at')
            .eq('key', CACHE_KEY)
            .maybeSingle();

        // Initialize KST Date
        const getKSTDate = (date: Date) => {
            return new Date(date.getTime() + (9 * 60 * 60 * 1000));
        };
        const kstNow = getKSTDate(new Date());
        const kstTodayStr = kstNow.toISOString().split('T')[0];
        const kstMonthStr = kstTodayStr.substring(0, 7);
        const kstDayOfMonth = kstNow.getUTCDate();

        const refreshParam = event.queryStringParameters?.refresh === 'true';

        // Cache Logic (24 hours)
        let resultData = null;
        let shouldUseCache = false;

        if (cacheData && cacheData.value && !refreshParam) {
            const lastUpdated = new Date(cacheData.updated_at);
            const diffMs = new Date().getTime() - lastUpdated.getTime();
            if (diffMs < 24 * 60 * 60 * 1000) {
                shouldUseCache = true;
                resultData = cacheData.value;
            }
        }

        if (!shouldUseCache) {
            console.log(`[get-site-stats] 🔄 Calculating Stats... KST: ${kstTodayStr}, Day: ${kstDayOfMonth}`);

            // Refresh source index
            await supabaseAdmin.rpc('refresh_site_stats_index');

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
                calculatedAt: new Date().toISOString()
            };

            const { data: eventMetrics } = await supabaseAdmin
                .from('site_stats_index')
                .select('metric_type, dim_cat, dim_genre, ref_date, val')
                .in('metric_type', ['act_count', 'reg_count']);

            const monthlyMap: any = {};
            const weeklyMap: any = {};
            const genreMap: any = {};
            let totalItems = 0;

            const kstYear = kstNow.getUTCFullYear();
            const kstMonth = kstNow.getUTCMonth() + 1;
            const currentMonthStart = `${kstYear}-${String(kstMonth).padStart(2, '0')}-01`;
            const currentMonthEnd = new Date(Date.UTC(kstYear, kstMonth, 0)).toISOString().split('T')[0];

            const monthlyWeeklyMap: any = {};
            const EXCLUDE_KEYWORDS = ['워크샵', '라이브밴드', '파티', '대회', '행사'];

            eventMetrics?.forEach(row => {
                const dateObj = new Date(row.ref_date + 'T00:00:00Z');
                const dow = dateObj.getUTCDay();
                const month = row.ref_date.substring(0, 7);
                const val = Number(row.val);

                if (row.metric_type === 'act_count') {
                    totalItems += val;
                    if (!monthlyMap[month]) {
                        monthlyMap[month] = { month, classes: 0, socials: 0, clubs: 0, events: 0, registrations: 0, total: 0, totalUntilToday: 0 };
                    }
                    monthlyMap[month].total += val;
                    if (row.ref_date <= kstTodayStr) {
                        monthlyMap[month].totalUntilToday += val;
                    }

                    if (row.dim_cat === 'class') monthlyMap[month].classes += val;
                    else if (row.dim_cat === 'social') monthlyMap[month].socials += val;
                    else monthlyMap[month].events += val;

                    if (row.dim_genre && row.dim_genre !== '기타') {
                        const rawGenres = row.dim_genre.split(',').map((g: string) => g.trim()).filter((g: string) => g && !EXCLUDE_KEYWORDS.some(ex => g.includes(ex)));
                        if (rawGenres.length > 0) {
                            const weightPerGenre = val / rawGenres.length;
                            rawGenres.forEach((g: string) => {
                                const finalG = g === '정규강습' ? '동호회 정규강습' : g;
                                if (!weeklyMap[dow]) weeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                                weeklyMap[dow].genres[finalG] = (weeklyMap[dow].genres[finalG] || 0) + weightPerGenre;
                                genreMap[finalG] = (genreMap[finalG] || 0) + weightPerGenre;
                                if (row.ref_date >= currentMonthStart && row.ref_date <= currentMonthEnd) {
                                    if (!monthlyWeeklyMap[dow]) monthlyWeeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                                    monthlyWeeklyMap[dow].genres[finalG] = (monthlyWeeklyMap[dow].genres[finalG] || 0) + weightPerGenre;
                                }
                            });
                        }
                    }

                    if (!weeklyMap[dow]) weeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                    weeklyMap[dow].count += val;
                    if (row.dim_cat === 'class') weeklyMap[dow].classes += val;
                    else if (row.dim_cat === 'social') weeklyMap[dow].socials += val;
                    else weeklyMap[dow].events += val;

                    if (row.ref_date >= currentMonthStart && row.ref_date <= currentMonthEnd) {
                        if (!monthlyWeeklyMap[dow]) monthlyWeeklyMap[dow] = { dow, count: 0, classes: 0, socials: 0, clubs: 0, events: 0, genres: {} };
                        monthlyWeeklyMap[dow].count += val;
                        if (row.dim_cat === 'class') monthlyWeeklyMap[dow].classes += val;
                        else if (row.dim_cat === 'social') monthlyWeeklyMap[dow].socials += val;
                        else monthlyWeeklyMap[dow].events += val;
                    }
                } else if (row.metric_type === 'reg_count') {
                    if (!monthlyMap[month]) monthlyMap[month] = { month, classes: 0, socials: 0, clubs: 0, events: 0, registrations: 0, total: 0, totalUntilToday: 0 };
                    monthlyMap[month].registrations += val;
                }
            });

            const monthly = Object.values(monthlyMap).map((m: any) => {
                const [year, monthNum] = m.month.split('-').map(Number);
                const isCurrentMonth = year === (kstNow.getUTCFullYear()) && monthNum === (kstNow.getUTCMonth() + 1);
                const daysInMonth = isCurrentMonth ? kstDayOfMonth : new Date(year, monthNum, 0).getDate();
                const totalForAvg = isCurrentMonth ? m.totalUntilToday : m.total;
                return { ...m, dailyAvg: Number((totalForAvg / (daysInMonth || 1)).toFixed(1)) };
            }).sort((a: any, b: any) => a.month.localeCompare(b.month));

            const topGenresList = Object.entries(genreMap).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).slice(0, 20).map(e => e[0]);
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const dowOrder: Record<string, number> = { '일': 1, '월': 2, '화': 3, '수': 4, '목': 5, '금': 6, '토': 7 };
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
                return { day: days[dow], count: Number(w.count.toFixed(1)), typeBreakdown: [{ name: '강습', count: w.classes }, { name: '행사', count: w.events }, { name: '동호회 이벤트+소셜', count: (w.socials || 0) + (w.clubs || 0) }], genreBreakdown, topGenre: genreBreakdown[0]?.name || '-', items: [] };
            }).sort((a, b) => (dowOrder[a.day] || 0) - (dowOrder[b.day] || 0));

            const monthlyWeekly = [0, 1, 2, 3, 4, 5, 6].map(dow => {
                const w = monthlyWeeklyMap[dow] || { dow, count: 0, classes: 0, socials: 0, clubs: 0, genres: {} };
                const genreBreakdown = getSortedBreakdown(w.genres);
                return { day: days[dow], count: Number(w.count.toFixed(1)), typeBreakdown: [{ name: '강습', count: w.classes }, { name: '행사', count: w.events }, { name: '동호회 이벤트+소셜', count: (w.socials || 0) + (w.clubs || 0) }], genreBreakdown, items: [] };
            }).sort((a, b) => (dowOrder[a.day] || 0) - (dowOrder[b.day] || 0));

            const currentMonthData: any = monthlyMap[kstMonthStr];
            const dailyAverage = currentMonthData ? Number((currentMonthData.totalUntilToday / kstDayOfMonth).toFixed(1)) : 0;

            console.log(`[get-site-stats] ✅ Calculation Complete. dailyAverage: ${dailyAverage}`);

            resultData = {
                summary: { ...summaryStats, totalItems, dailyAverage, topDay: [...totalWeekly].sort((a, b) => b.count - a.count)[0]?.day || '-' },
                monthly,
                totalWeekly,
                monthlyWeekly,
                topGenresList
            };

            const { data: promoMetrics } = await supabaseAdmin.from('site_stats_index').select('dim_cat, val, ref_date, reg_date').eq('metric_type', 'promo_stat');
            const leadTimeStats = { class: { early: 0, mid: 0, late: 0, earlyCount: 0, midCount: 0, lateCount: 0 }, event: { early: 0, mid: 0, late: 0, earlyCount: 0, midCount: 0, lateCount: 0 } };
            promoMetrics?.forEach((row: any) => {
                if (!row.ref_date || !row.reg_date) return;
                const leadDays = Math.floor((new Date(row.ref_date).getTime() - new Date(row.reg_date).getTime()) / (1000 * 60 * 60 * 24));
                const val = Number(row.val);
                const type = row.dim_cat === 'class' ? 'class' : 'event';
                if (type === 'class') {
                    if (leadDays >= 21) { leadTimeStats.class.early += val; leadTimeStats.class.earlyCount++; }
                    else if (leadDays >= 7) { leadTimeStats.class.mid += val; leadTimeStats.class.midCount++; }
                    else { leadTimeStats.class.late += val; leadTimeStats.class.lateCount++; }
                } else {
                    if (leadDays >= 35) { leadTimeStats.event.early += val; leadTimeStats.event.earlyCount++; }
                    else if (leadDays >= 14) { leadTimeStats.event.mid += val; leadTimeStats.event.midCount++; }
                    else { leadTimeStats.event.late += val; leadTimeStats.event.lateCount++; }
                }
            });
            const leadTimeAnalysis = {
                classEarly: leadTimeStats.class.earlyCount > 0 ? Number((leadTimeStats.class.early / leadTimeStats.class.earlyCount).toFixed(1)) : 0,
                classMid: leadTimeStats.class.midCount > 0 ? Number((leadTimeStats.class.mid / leadTimeStats.class.midCount).toFixed(1)) : 0,
                classLate: leadTimeStats.class.lateCount > 0 ? Number((leadTimeStats.class.late / leadTimeStats.class.lateCount).toFixed(1)) : 0,
                eventEarly: leadTimeStats.event.earlyCount > 0 ? Number((leadTimeStats.event.early / leadTimeStats.event.earlyCount).toFixed(1)) : 0,
                eventMid: leadTimeStats.event.midCount > 0 ? Number((leadTimeStats.event.mid / leadTimeStats.event.midCount).toFixed(1)) : 0,
                eventLate: leadTimeStats.event.lateCount > 0 ? Number((leadTimeStats.event.late / leadTimeStats.event.lateCount).toFixed(1)) : 0
            };

            const finalData = { ...resultData, leadTimeAnalysis };

            // Save to Cache
            await supabaseAdmin.from('metrics_cache').upsert({
                key: CACHE_KEY,
                value: finalData,
                updated_at: new Date().toISOString()
            });

            resultData = finalData;
        }

        const finalBody = {
            ...(resultData.summary || {}),
            summary: resultData.summary || {},
            monthly: resultData.monthly || [],
            totalWeekly: resultData.totalWeekly || [],
            monthlyWeekly: resultData.monthlyWeekly || [],
            topGenresList: resultData.topGenresList || [],
            leadTimeAnalysis: resultData.leadTimeAnalysis
        };

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=0, must-revalidate'
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
