
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';

export interface BillboardData {
    loading: boolean;
    meta: {
        totalLogs: number;
        uniqueVisitors: number;
        clickRate: number;
        range: string;
        monthLabel: string;
        monthKor: string;
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
    // Default: Previous Month
    const [targetDate, setTargetDate] = useState<{ year: number, month: number } | 'all'>(() => {
        const now = new Date();
        now.setMonth(now.getMonth() - 1); // Go back 1 month
        return { year: now.getFullYear(), month: now.getMonth() };
    });

    const [data, setData] = useState<BillboardData | null>(null);
    const [loading, setLoading] = useState(true);

    // Cache Key Generator
    const getCacheKey = (target: { year: number, month: number } | 'all') => {
        if (target === 'all') return 'monthly_billboard_cache_all';
        return `monthly_billboard_cache_${target.year}_${target.month}`;
    };

    useEffect(() => {
        const cacheKey = getCacheKey(targetDate);
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            try {
                const { timestamp, data, v } = JSON.parse(cached);
                const now = new Date().getTime();
                // 1 Hour Cache + Version Invalidation (v11_selector)
                if (v === 'v11_selector' && now - timestamp < 3600 * 1000) {
                    setData(data);
                    setLoading(false);
                    return; // Cache hit
                }
            } catch (e) {
                console.error('Cache parse failed', e);
            }
        }

        // If no cache, fetch
        setLoading(true);
        fetchMonthlyData(targetDate);
    }, [targetDate]);

    const fetchMonthlyData = async (target: { year: number, month: number } | 'all') => {
        try {
            let startStr, endStr, monthLabel, monthKor, rangeStr, eventStartStr, eventEndStr;
            const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const pad = (n: number) => n.toString().padStart(2, '0');

            if (target === 'all') {
                // All Time Logic (Start from Jan 2026)
                const now = new Date();
                startStr = '2026-01-01T00:00:00+09:00';
                endStr = now.toISOString();

                monthLabel = 'ALL TIME';
                monthKor = '전체';
                rangeStr = `Since 2026 - ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

                eventStartStr = '2026-01-01';
                eventEndStr = now.toISOString();
            } else {
                // Specific Month Logic
                const { year, month } = target;
                const endD = new Date(year, month + 1, 0);

                startStr = `${year}-${pad(month + 1)}-01T00:00:00+09:00`;
                endStr = `${year}-${pad(month + 1)}-${pad(endD.getDate())}T23:59:59+09:00`;

                monthLabel = `${monthNames[month]} ${year}`;
                monthKor = `${month + 1}월`;
                rangeStr = `${monthNames[month]} 1 - ${monthNames[month]} ${endD.getDate()}`;

                // Supply: target month +/- 1 month (approx)
                const prevM = new Date(year, month - 1, 1);
                const nextM = new Date(year, month + 2, 0);

                eventStartStr = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}-01`;
                eventEndStr = `${nextM.getFullYear()}-${pad(nextM.getMonth() + 1)}-${pad(nextM.getDate())}`;
            }

            // 1. Fetch Events (Supply)
            const { data: events, error: eError } = await supabase
                .from('events')
                .select('id, title, start_date, created_at, category')
                .gte('start_date', eventStartStr)
                .lte('start_date', eventEndStr);

            if (eError) throw eError;

            // 2. Fetch Analyzed Data via RPC
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('get_monthly_webzine_stats', {
                    start_date: startStr,
                    end_date: endStr
                });

            if (rpcError) throw rpcError;

            // --- Analysis & Transformation ---
            const stats = rpcData as any;

            // Meta
            const uniqueVisitors = stats.meta.uniqueVisitors;
            const totalLogs = stats.meta.totalLogs;
            const clickRate = uniqueVisitors > 0 ? Number((totalLogs / uniqueVisitors).toFixed(1)) : 0;

            // A. Weekly Flow (Supply + Traffic)
            const classStartCounts = Array(7).fill(0);
            const socialCounts = Array(7).fill(0);
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

            const visitorTrafficCounts = Array(7).fill(0);
            if (stats.dailyTraffic && Array.isArray(stats.dailyTraffic)) {
                stats.dailyTraffic.forEach((d: any) => {
                    if (d.day >= 0 && d.day <= 6) {
                        visitorTrafficCounts[d.day] = d.count;
                    }
                });
            }

            const monTueClass = classStartCounts[1] + classStartCounts[2];
            const classStartRatio = totalClass > 0 ? Math.round((monTueClass / totalClass) * 100) : 0;
            const weekendSocial = socialCounts[5] + socialCounts[6] + socialCounts[0];
            const weekendSocialRatio = totalSocial > 0 ? Math.round((weekendSocial / totalSocial) * 100) : 0;
            const weekendClassDrop = 0;

            // B. Daily Flow (Hourly)
            const hours = Array(24).fill(0).map((_, i) => ({ hour: i, class: 0, event: 0 }));
            let totalClassViews = 0;
            let totalEventViews = 0;

            if (stats.hourlyStats && Array.isArray(stats.hourlyStats)) {
                stats.hourlyStats.forEach((h: any) => {
                    const hourIdx = h.hour;
                    if (hourIdx >= 0 && hourIdx < 24) {
                        hours[hourIdx].class = h.class_count;
                        hours[hourIdx].event = h.event_count;
                        totalClassViews += h.class_count;
                        totalEventViews += h.event_count;
                    }
                });
            }

            // Uniform Peak Finding
            let maxClassH = 11, maxClassValRaw = 0;
            let maxEventH = 19, maxEventValRaw = 0;

            hours.forEach(h => {
                if (h.class > maxClassValRaw) { maxClassValRaw = h.class; maxClassH = h.hour; }
                if (h.event > maxEventValRaw) { maxEventValRaw = h.event; maxEventH = h.hour; }
            });

            // Normalize for visual rendering
            const combinedViews = totalClassViews + totalEventViews;
            const normalizedHours = hours.map(h => ({
                hour: h.hour,
                class: combinedViews > 0 ? (h.class / combinedViews) * 100 : 0,
                event: combinedViews > 0 ? (h.event / combinedViews) * 100 : 0
            }));

            // C. Top Contents
            const sortedRanking = stats.topContents || [];

            const result: BillboardData = {
                loading: false,
                meta: {
                    totalLogs,
                    uniqueVisitors,
                    clickRate,
                    range: rangeStr,
                    monthLabel,
                    monthKor
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
                const cacheKey = getCacheKey(target);
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: new Date().getTime(),
                    data: result,
                    v: 'v11_selector'
                }));
            } catch (e) {
                console.error('Cache save failed', e);
            }

        } catch (error) {
            console.error('Fetch Monthly Billboard Error:', error);
            setLoading(false);
        }
    };

    return useMemo(() => ({ data, loading, targetDate, setTargetDate }), [data, loading, targetDate]);
};
