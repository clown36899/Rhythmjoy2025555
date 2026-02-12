
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
        classEarly: number;
        classMid: number;
        classLate: number;
        eventEarly: number;
        eventMid: number;
        eventLate: number;
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

export const useMonthlyBillboard = (initialTarget?: { year: number, month: number } | 'all') => {
    // Default: Previous Month or Initial Target
    const [targetDate, setTargetDate] = useState<{ year: number, month: number } | 'all'>(() => {
        if (initialTarget) return initialTarget;
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

    console.log('[빌보드 디버그] 🔄 useMonthlyBillboard 훅 렌더링됨', {
        loading,
        hasData: !!data,
        target: targetDate
    });

    useEffect(() => {
        console.log('[빌보드 디버그] 🏁 데이터 로드 시작 (캐시를 사용하지 않고 항상 서버에서 가져옵니다)', { targetDate });
        setLoading(true);
        fetchMonthlyData(targetDate);
    }, [targetDate]);

    const fetchMonthlyData = async (target: { year: number, month: number } | 'all') => {
        try {
            let startStr, endStr, monthLabel, monthKor, rangeStr, eventStartStr, eventEndStr;
            const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const pad = (n: number) => n.toString().padStart(2, '0');

            if (target === 'all') {
                // All Time Logic (Start from Jan 2025 for better analysis)
                const now = new Date();
                startStr = '2025-01-01T00:00:00+09:00';
                endStr = now.toISOString();

                monthLabel = 'ALL TIME';
                monthKor = '전체';
                rangeStr = `Since 2025 - ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

                eventStartStr = '2025-01-01';
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

            // 2. RPC를 통한 분석 데이터 페칭 (상세 로깅 포함)
            console.log('[빌보드 디버그] 🚀 월간 데이터 요청 시작...', {
                대상: target,
                시작일: startStr,
                종료일: endStr
            });

            const { data: { session } } = await supabase.auth.getSession();
            console.log('[빌보드 디버그] 🔑 현재 사용자 세션 상태:', {
                권한: session?.user?.role || '익명(anon)',
                로그인여부: !!session,
                이메일: session?.user?.email,
                최근로그인: session?.user?.last_sign_in_at
            });

            const { data: rpcData, error: rpcError } = await supabase
                .rpc('get_monthly_webzine_stats', {
                    p_start_date: startStr,
                    p_end_date: endStr
                });

            if (rpcError) {
                console.error('[빌보드 디버그] ❌ RPC 요청 에러 발생:', {
                    에러코드: rpcError.code,
                    메시지: rpcError.message,
                    상세: rpcError.details,
                    힌트: rpcError.hint
                });
                throw rpcError;
            }

            console.log('[빌보드 디버그] ✅ 서버에서 수신된 원본 데이터:', rpcData);
            const stats = rpcData as any;

            if (stats?.meta?.distribution) {
                console.log('[빌보드 디버그] 📊 1월 데이터 타입별 분포:', stats.meta.distribution);
                const missingCount = stats.meta.totalLogs - Object.values(stats.meta.distribution as Record<string, number>).reduce((a, b) => a + b, 0);
                if (missingCount > 0) {
                    console.log(`[빌보드 디버그] ⚠️ 분석되지 않은 기타 데이터: ${missingCount} 건`);
                }
            }

            // --- 데이터 가공 및 변환 ---
            if (!stats || !stats.meta) {
                console.warn('[빌보드 디버그] ⚠️ 서버가 빈 데이터나 잘못된 구조를 반환했습니다:', stats);
            }

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
            // 1. 시간대별 데이터 매핑 (KST 기준)
            const rawHourMap: Record<number, { class: number, event: number }> = {};
            for (let i = 0; i < 24; i++) rawHourMap[i] = { class: 0, event: 0 };

            let totalClassViews = 0;
            let totalEventViews = 0;

            stats.hourlyStats?.forEach((h: any) => {
                const hr = parseInt(h.hour);
                if (hr >= 0 && hr < 24) {
                    rawHourMap[hr] = {
                        class: h.class_count || 0,
                        event: h.event_count || 0
                    };
                    totalClassViews += h.class_count || 0;
                    totalEventViews += h.event_count || 0;
                }
            });

            const rawHourlyData = Object.keys(rawHourMap).sort((a, b) => Number(a) - Number(b)).map(h => ({
                hour: Number(h),
                ...rawHourMap[Number(h)]
            }));

            // Peak 계산
            let classPeak = 0, eventPeak = 0;
            let classMax = -1, eventMax = -1;
            rawHourlyData.forEach(d => {
                if (d.class > classMax) { classMax = d.class; classPeak = d.hour; }
                if (d.event > eventMax) { eventMax = d.event; eventPeak = d.hour; }
            });

            console.log('[빌보드 디버그] 🕒 시간대별 피크 탐지:', { 강습피크: classPeak, 행사피크: eventPeak });

            // Normalize for visual rendering
            const combinedViews = totalClassViews + totalEventViews;
            const normalizedHours = rawHourlyData.map(h => ({
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
                    hourlyData: normalizedHours,
                    rawHourlyData,
                    classPeakHour: classPeak,
                    eventPeakHour: eventPeak
                },
                leadTime: stats.leadTime || {
                    classEarly: 0,
                    classMid: 0,
                    classLate: 0,
                    eventEarly: 0,
                    eventMid: 0,
                    eventLate: 0
                },
                topContents: sortedRanking
            };

            console.log('[빌보드 디버그] ✨ 데이터 가공 완료:', result.meta);
            setData(result);
            setLoading(false);

            console.log('[빌보드 디버그] ✨ 데이터 가공 및 상태 업데이트 완료');
            setData(result);
            setLoading(false);

        } catch (error) {
            console.error('Fetch Monthly Billboard Error:', error);
            setLoading(false);
        }
    };

    return useMemo(() => ({ data, loading, targetDate, setTargetDate }), [data, loading, targetDate]);
};
