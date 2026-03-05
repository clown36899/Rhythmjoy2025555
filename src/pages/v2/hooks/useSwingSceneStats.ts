
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
    maxDaily: number;
    maxDailyDate?: string;
}

// Global session cache to share data across components and persist after closing/opening modal
let sessionCache: SceneStats | null = null;
let isFetching = false;
let fetchPromise: Promise<SceneStats | null> | null = null;

// 인스턴스 카운터 (디버깅용)
let instanceCounter = 0;

export const useSwingSceneStats = () => {
    const instanceId = useRef(++instanceCounter);
    const [stats, setStats] = useState<SceneStats | null>(sessionCache);
    const [loading, setLoading] = useState(!sessionCache);
    const [refreshing, setRefreshing] = useState(false);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        console.log(`[Stats#${instanceId.current}] 마운트 - sessionCache:${sessionCache ? '있음' : '없음'}, isFetching:${isFetching}, loading:${!sessionCache}`);
        return () => {
            isMounted.current = false;
            console.log(`[Stats#${instanceId.current}] 언마운트`);
        };
    }, []);

    const fetchSceneStats = useCallback(async (isManualRefresh = false) => {
        if (!isManualRefresh && isFetching && fetchPromise) {
            console.log(`[Stats#${instanceId.current}] fetchSceneStats: 이미 fetch 중 - 기존 promise 반환`);
            return fetchPromise;
        }

        console.log(`[Stats#${instanceId.current}] fetchSceneStats: 새 fetch 시작 (isManualRefresh:${isManualRefresh})`);
        isFetching = true;
        setLoading(true);

        fetchPromise = (async () => {
            try {
                const timestamp = new Date().getTime();
                const baseUrl = '/.netlify/functions/get-site-stats';
                const url = isManualRefresh
                    ? `${baseUrl}?refresh=true&t=${timestamp}`
                    : `${baseUrl}?t=${timestamp}`;

                console.log(`[Stats#${instanceId.current}] API 요청: ${url}`);
                const response = await fetch(url, {
                    cache: 'no-store',
                    headers: {
                        'Pragma': 'no-cache',
                        'Cache-Control': 'no-cache'
                    }
                });

                console.log(`[Stats#${instanceId.current}] API 응답: status=${response.status}, ok=${response.ok}`);
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                console.log(`[Stats#${instanceId.current}] 데이터 파싱 완료 - monthly:${data.monthly?.length}개, summary:`, data.summary);

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
                console.log(`[Stats#${instanceId.current}] sessionCache 업데이트 완료. isMounted:${isMounted.current}`);

                if (isMounted.current) {
                    console.log(`[Stats#${instanceId.current}] setStats 호출 (직접 인스턴스)`);
                    setStats(newStats);
                } else {
                    console.warn(`[Stats#${instanceId.current}] isMounted=false - 이 인스턴스에는 setStats 불가 (다른 구독자가 처리해야 함)`);
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
                console.error(`[Stats#${instanceId.current}] API Error:`, error);
                return null;
            } finally {
                isFetching = false;
                fetchPromise = null;
                console.log(`[Stats#${instanceId.current}] fetch 완료 - isFetching=false. isMounted:${isMounted.current}`);
                if (isMounted.current) {
                    setLoading(false);
                } else {
                    console.warn(`[Stats#${instanceId.current}] finally: isMounted=false - setLoading 스킵 (구독자가 처리)`);
                }
            }
        })();

        return fetchPromise;
    }, []);

    const loadServerCache = useCallback(async () => {
        if (sessionCache || isFetching) {
            console.log(`[Stats#${instanceId.current}] loadServerCache 스킵 - sessionCache:${sessionCache ? '있음' : '없음'}, isFetching:${isFetching}`);
            return;
        }

        console.log(`[Stats#${instanceId.current}] loadServerCache: DB에서 캐시 로드 시도`);
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

                if (!sessionCache) {
                    console.log(`[Stats#${instanceId.current}] loadServerCache: DB 캐시로 임시 표시 (totalItems:${newStats.summary.totalItems})`);
                    setStats(newStats);
                    setLoading(false);
                } else {
                    console.log(`[Stats#${instanceId.current}] loadServerCache: API fetch가 먼저 완료됨 - DB 캐시 무시`);
                }
            } else {
                console.log(`[Stats#${instanceId.current}] loadServerCache: DB 캐시 없음 또는 언마운트`);
            }
        } catch (e) {
            console.error(`[Stats#${instanceId.current}] loadServerCache 실패:`, e);
        }
    }, []);

    const manualRefresh = useCallback(async () => {
        if (!confirm('DB 통계 인덱스를 재생성하고 캐시를 갱신하시겠습니까?')) return;
        console.log(`[Stats#${instanceId.current}] 수동 갱신 시작`);
        setRefreshing(true);
        try {
            const { error } = await supabase.rpc('refresh_site_stats_index');
            if (error) throw error;
            console.log(`[Stats#${instanceId.current}] refresh_site_stats_index 완료`);
            await fetchSceneStats(true);
            alert('통계 인덱스가 성공적으로 최신화되었습니다.');
        } catch (err) {
            console.error(`[Stats#${instanceId.current}] 수동 갱신 실패:`, err);
            alert('갱신 실패: ' + (err as any).message);
        } finally {
            if (isMounted.current) setRefreshing(false);
        }
    }, [fetchSceneStats]);

    // Initial load logic
    useEffect(() => {
        const id = instanceId.current;
        if (!sessionCache && !isFetching) {
            console.log(`[Stats#${id}] 초기 로드: 새 fetch 시작`);
            loadServerCache();
            fetchSceneStats();
        } else if (!sessionCache && isFetching && fetchPromise) {
            // 다른 컴포넌트 인스턴스가 시작한 fetch가 진행 중인 경우,
            // 해당 promise에 구독하여 이 컴포넌트도 결과를 받을 수 있도록 처리
            console.warn(`[Stats#${id}] 초기 로드: fetch 이미 진행 중 - fetchPromise 구독 (버그 방어 경로)`);
            fetchPromise.then((result) => {
                console.log(`[Stats#${id}] fetchPromise 구독 완료 - result:${result ? '있음' : '없음'}, isMounted:${isMounted.current}`);
                if (isMounted.current) {
                    if (result) setStats(result);
                    setLoading(false);
                } else {
                    console.warn(`[Stats#${id}] fetchPromise 구독: 이미 언마운트됨 - 무시`);
                }
            }).catch((err) => {
                console.error(`[Stats#${id}] fetchPromise 구독 에러:`, err);
                if (isMounted.current) setLoading(false);
            });
        } else if (sessionCache) {
            console.log(`[Stats#${id}] 초기 로드: sessionCache 있음 - 즉시 표시 (totalItems:${sessionCache.summary.totalItems})`);
        }
    }, [loadServerCache, fetchSceneStats]);

    return {
        stats,
        loading,
        refreshing,
        manualRefresh,
        prefetch: () => {
            if (!sessionCache && !isFetching) {
                console.log(`[Stats#${instanceId.current}] prefetch 호출`);
                fetchSceneStats();
            }
        }
    };
};
