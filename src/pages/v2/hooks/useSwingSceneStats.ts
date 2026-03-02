
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

export interface StatItem {
    type: '강습' | '행사' | '동호회 이벤트+소셜';
    title: string;
    date: string;
    createdAt: string;
    genre: string;
    day: string;
}

export interface DayStats {
    day: string;
    count: number;
    typeBreakdown: { name: string; count: number }[];
    genreBreakdown: { name: string; count: number }[];
    topGenre: string;
    items: StatItem[];
}

export interface SceneStats {
    monthly: MonthlyStat[];
    totalWeekly: DayStats[];
    monthlyWeekly: DayStats[];
    topGenresList: string[];
    summary: {
        totalItems: number;
        dailyAverage: number;
        topDay: string;
        memberCount?: number;
        pwaCount?: number;
        pushCount?: number;
    };
    leadTimeAnalysis?: {
        classEarly: number;
        classMid: number;
        classLate: number;
        eventEarly: number;
        eventMid: number;
        eventLate: number;
    };
}

export interface MonthlyStat {
    month: string;
    classes: number;
    events: number;
    socials: number;
    clubs: number;
    total: number;
    registrations: number;
    dailyAvg: number;
}

// Global session cache to share data across components and persist after closing/opening modal
let sessionCache: SceneStats | null = null;
let isFetching = false;
let fetchPromise: Promise<SceneStats | null> | null = null;

export const useSwingSceneStats = () => {
    const [stats, setStats] = useState<SceneStats | null>(sessionCache);
    const [loading, setLoading] = useState(!sessionCache);
    const [refreshing, setRefreshing] = useState(false);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const fetchSceneStats = useCallback(async (isManualRefresh = false) => {
        if (!isManualRefresh && isFetching && fetchPromise) return fetchPromise;

        isFetching = true;
        setLoading(true);

        fetchPromise = (async () => {
            try {
                const timestamp = new Date().getTime();
                const baseUrl = '/.netlify/functions/get-site-stats';
                const url = isManualRefresh
                    ? `${baseUrl}?refresh=true&t=${timestamp}`
                    : `${baseUrl}?t=${timestamp}`;

                const response = await fetch(url, {
                    cache: 'no-store',
                    headers: {
                        'Pragma': 'no-cache',
                        'Cache-Control': 'no-cache'
                    }
                });

                if (!response.ok) throw new Error('API Error');
                const data = await response.json();

                const newStats: SceneStats = {
                    monthly: data.monthly || [],
                    totalWeekly: (data.totalWeekly || []).map((d: any) => ({
                        ...d,
                        items: Array.isArray(d.items) ? d.items.flat() : []
                    })),
                    monthlyWeekly: (data.monthlyWeekly || []).map((d: any) => ({
                        ...d,
                        items: Array.isArray(d.items) ? d.items.flat() : []
                    })),
                    topGenresList: data.topGenresList || [],
                    summary: {
                        totalItems: data.summary?.totalItems || 0,
                        dailyAverage: data.summary?.dailyAverage || 0,
                        topDay: data.summary?.topDay || '-',
                        memberCount: data.summary?.memberCount || 0,
                        pwaCount: data.summary?.pwaCount || 0,
                        pushCount: data.summary?.pushCount || 0
                    },
                    leadTimeAnalysis: data.leadTimeAnalysis
                };

                sessionCache = newStats;
                if (isMounted.current) {
                    setStats(newStats);
                }

                // Dispatch event for other listeners
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('statsUpdated', {
                        detail: {
                            total: newStats.summary.totalItems,
                            avg: newStats.summary.dailyAverage,
                            memberCount: newStats.summary.memberCount,
                            pwaCount: newStats.summary.pwaCount,
                            pushCount: newStats.summary.pushCount
                        }
                    }));
                }, 0);

                return newStats;
            } catch (error) {
                console.error('[useSwingSceneStats] API Error:', error);
                return null;
            } finally {
                isFetching = false;
                fetchPromise = null;
                if (isMounted.current) {
                    setLoading(false);
                }
            }
        })();

        return fetchPromise;
    }, []);

    const loadServerCache = useCallback(async () => {
        // Skip if we already have session cache or are fetching
        if (sessionCache || isFetching) return;

        try {
            const { data } = await supabase
                .from('metrics_cache')
                .select('value')
                .eq('key', 'scene_analytics_v3')
                .maybeSingle();

            if (isMounted.current && data?.value) {
                const cached = data.value as any;
                const newStats: SceneStats = {
                    monthly: cached.monthly || [],
                    summary: cached.summary || { totalItems: 0, dailyAverage: 0, topDay: '-' },
                    totalWeekly: [],
                    monthlyWeekly: [],
                    topGenresList: [],
                    leadTimeAnalysis: cached.leadTimeAnalysis
                };

                // If we still don't have session cache by now, use this partial cache
                if (!sessionCache) {
                    setStats(newStats);
                    setLoading(false);
                }
            }
        } catch (e) {
            console.error('[useSwingSceneStats] Server cache load failed', e);
        }
    }, []);

    const manualRefresh = useCallback(async () => {
        if (!confirm('DB 통계 인덱스를 재생성하고 캐시를 갱신하시겠습니까?')) return;
        setRefreshing(true);
        try {
            const { error } = await supabase.rpc('refresh_site_stats_index');
            if (error) throw error;
            await fetchSceneStats(true);
            alert('통계 인덱스가 성공적으로 최신화되었습니다.');
        } catch (err) {
            console.error('[useSwingSceneStats] Refresh Error:', err);
            alert('갱신 실패: ' + (err as any).message);
        } finally {
            if (isMounted.current) setRefreshing(false);
        }
    }, [fetchSceneStats]);

    // Initial load logic
    useEffect(() => {
        if (!sessionCache && !isFetching) {
            loadServerCache();
            fetchSceneStats();
        }
    }, [loadServerCache, fetchSceneStats]);

    return {
        stats,
        loading,
        refreshing,
        manualRefresh,
        prefetch: () => {
            if (!sessionCache && !isFetching) {
                fetchSceneStats();
            }
        }
    };
};
