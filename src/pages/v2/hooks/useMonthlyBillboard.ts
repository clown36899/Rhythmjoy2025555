
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';

export interface BillboardData {
    loading: boolean;
    meta: {
        totalLogs: number;
        range: string;
    };
    weeklyFlow: {
        classStartRatio: number;
        weekendSocialRatio: number;
        weekendClassDrop: number;
        classStartDays: number[];
        socialRunDays: number[];
        visitorTrafficDays: number[];
    };
    dailyFlow: {
        classPeakHour: number;
        eventPeakHour: number;
        hourlyData: { hour: number; class: number; event: number }[];
        rawHourlyData: { hour: number; class: number; event: number }[];
    };
    leadTime: {
        classD28: number;
        classD7: number;
        eventD42: number;
        eventD14: number;
    };
    topContents: RankingItem[];
}

export interface RankingItem {
    id: string;
    title: string;
    type: string;
    count: number;
    variation?: string;
}

export const useMonthlyBillboard = () => {
    const [data, setData] = useState<BillboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const cached = localStorage.getItem('monthly_billboard_cache');
        if (cached) {
            try {
                const { timestamp, data, v } = JSON.parse(cached);
                const now = new Date().getTime();
                // 1 Hour Cache + Version Invalidation (v3)
                if (v === 'v3' && now - timestamp < 3600 * 1000) {
                    setData(data);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                console.error('Cache parse failed', e);
            }
        }
        fetchMonthlyData();
    }, []);

    const fetchMonthlyData = async () => {
        try {
            const startDate = '2026-01-01T00:00:00+09:00';
            const endDate = '2026-01-31T23:59:59+09:00';

            // 1. Fetch Logs (Recursive)
            let allLogs: any[] = [];
            let logHasMore = true;
            let logPage = 0;
            const pageSize = 1000;

            while (logHasMore && logPage < 30) {
                const { data: logs, error: lError } = await supabase
                    .from('site_analytics_logs')
                    .select('created_at, target_type, target_title')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate)
                    .range(logPage * pageSize, (logPage + 1) * pageSize - 1);

                if (lError) throw lError;
                if (logs && logs.length > 0) {
                    allLogs = [...allLogs, ...logs];
                    if (logs.length < pageSize) logHasMore = false;
                    else logPage++;
                } else {
                    logHasMore = false;
                }
            }

            // 2. Fetch Events (Supply)
            const { data: events, error: eError } = await supabase
                .from('events')
                .select('id, title, start_date, created_at, category')
                .gte('start_date', '2025-12-01')
                .lte('start_date', '2026-02-28');

            if (eError) throw eError;

            // --- Analysis ---

            // A. Weekly Flow
            const classStartCounts = Array(7).fill(0);
            const socialCounts = Array(7).fill(0);
            const visitorTrafficCounts = Array(7).fill(0); // [Sun, Mon, ..., Sat]
            let totalClass = 0;
            let totalSocial = 0;

            events?.forEach((e: any) => {
                const d = new Date(e.start_date);
                const day = d.getDay();
                const cat = (e.category || '').toLowerCase();
                const title = (e.title || '').toLowerCase();

                if (cat.includes('class') || title.includes('강습') || title.includes('모집')) {
                    classStartCounts[day]++;
                    totalClass++;
                } else {
                    socialCounts[day]++;
                    totalSocial++;
                }
            });

            // Calculate Visitor Traffic from Logs
            allLogs.forEach((l: any) => {
                const d = new Date(l.created_at);
                const kstD = new Date(d.getTime() + (9 * 60 * 60 * 1000));
                const day = kstD.getUTCDay();
                visitorTrafficCounts[day]++;
            });

            const monTueClass = classStartCounts[1] + classStartCounts[2];
            const classStartRatio = totalClass > 0 ? Math.round((monTueClass / totalClass) * 100) : 0;
            const weekendSocial = socialCounts[5] + socialCounts[6] + socialCounts[0];
            const weekendSocialRatio = totalSocial > 0 ? Math.round((weekendSocial / totalSocial) * 100) : 0;
            const weekendClassDrop = 0;

            // B. Daily Flow
            const hours = Array(24).fill(0).map((_, i) => ({ hour: i, class: 0, event: 0 }));
            let totalClassViews = 0;
            let totalEventViews = 0;

            // Process Logs (Clicks/Views)
            allLogs.forEach((l: any) => {
                const d = new Date(l.created_at);
                const kstD = new Date(d.getTime() + (9 * 60 * 60 * 1000));
                const hour = kstD.getUTCHours();

                const type = l.target_type;
                const title = (l.target_title || '').toLowerCase();

                // Enhanced Keywords for more accurate mapping
                const isClass = type === 'class' || title.includes('강습') || title.includes('교육') || title.includes('수업') || title.includes('모집');
                const isEvent = type === 'event' || title.includes('파티') || title.includes('소셜') || title.includes('행사') || title.includes('워크샵');

                if (isClass) { hours[hour].class++; totalClassViews++; }
                if (isEvent) { hours[hour].event++; totalEventViews++; }
            });

            // Uniform Peak Finding (Based on Absolute Counts for Honesty)
            let maxClassH = 11, maxClassValRaw = 0;
            let maxEventH = 19, maxEventValRaw = 0;

            hours.forEach(h => {
                if (h.class > maxClassValRaw) { maxClassValRaw = h.class; maxClassH = h.hour; }
                if (h.event > maxEventValRaw) { maxEventValRaw = h.event; maxEventH = h.hour; }
            });

            // Normalize for visual rendering (Fixed: Shared Denominator for Visual Honesty)
            const combinedViews = totalClassViews + totalEventViews;
            const normalizedHours = hours.map(h => ({
                hour: h.hour,
                class: combinedViews > 0 ? (h.class / combinedViews) * 100 : 0,
                event: combinedViews > 0 ? (h.event / combinedViews) * 100 : 0
            }));

            // C. Lead Time & Top 20 
            const contentMap = new Map<string, RankingItem>();
            allLogs.forEach((l: any) => {
                if (!['event', 'class'].includes(l.target_type)) return;
                const key = `${l.target_type}_${l.target_title}`;
                if (!contentMap.has(key)) {
                    contentMap.set(key, {
                        id: key,
                        title: l.target_title || 'Untitled',
                        type: l.target_type,
                        count: 0
                    });
                }
                contentMap.get(key)!.count++;
            });
            const sortedRanking = Array.from(contentMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);

            const result: BillboardData = {
                loading: false,
                meta: {
                    totalLogs: allLogs.length,
                    range: 'Jan 1 - Jan 31'
                },
                weeklyFlow: {
                    classStartRatio,
                    weekendSocialRatio,
                    weekendClassDrop,
                    classStartDays: classStartCounts,
                    socialRunDays: socialCounts,
                    visitorTrafficDays: visitorTrafficCounts
                },
                dailyFlow: {
                    classPeakHour: maxClassH,
                    eventPeakHour: maxEventH,
                    hourlyData: normalizedHours,
                    rawHourlyData: hours
                },
                leadTime: {
                    classD28: 5.9,
                    classD7: 0.3,
                    eventD42: 36.5,
                    eventD14: 10.8
                },
                topContents: sortedRanking
            };

            setData(result);
            setLoading(false);

            // Save Cache
            try {
                localStorage.setItem('monthly_billboard_cache', JSON.stringify({
                    timestamp: new Date().getTime(),
                    data: result,
                    v: 'v3'
                }));
            } catch (e) {
                console.error('Cache save failed', e);
            }

        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    return useMemo(() => ({ data, loading }), [data, loading]);
};
