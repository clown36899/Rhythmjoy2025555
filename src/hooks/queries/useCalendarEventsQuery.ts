import { useQuery } from '@tanstack/react-query';
import { cafe24 } from '../../lib/cafe24Client';
import type { Event as AppEvent } from '../../lib/cafe24Client';
import { fetchCafe24Events, isCafe24EventsBackendEnabled } from '../../lib/cafe24EventsApi';
import { isEventInDanceScope, normalizeDanceScope, type DanceScope } from '../../utils/danceTaxonomy';

export interface CalendarData {
    events: AppEvent[];
    socialSchedules: any[];
}

export const CALENDAR_EVENTS_QUERY_VERSION = 'dance-scope-local-v7';

const toLocalDateString = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * 특정 날짜를 기준으로 달력에 필요한 3개월 범위(이전달, 현재달, 다음달)를 계산합니다.
 */
export const getCalendarRange = (date: Date) => {
    const startOfRange = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const endOfRange = new Date(date.getFullYear(), date.getMonth() + 2, 0);
    return {
        startDateStr: toLocalDateString(startOfRange),
        endDateStr: toLocalDateString(endOfRange)
    };
};

/**
 * 실제 데이터를 가져오는 핵심 비동기 함수입니다.
 */
export const fetchCalendarEvents = async (startDateStr: string, endDateStr: string, danceScope: DanceScope | string = 'swing') => {
    const normalizedScope = normalizeDanceScope(danceScope);

    if (isCafe24EventsBackendEnabled) {
        const events = await fetchCafe24Events({
            start: startDateStr,
            end: endDateStr,
            scope: normalizedScope,
            limit: 3000,
        });

        return {
            events: events.filter((event) => isEventInDanceScope(event as any, normalizedScope)),
            socialSchedules: [],
        };
    }

    const baseColumns = "id,title,date,start_date,end_date,event_dates,category,genre,image,image_micro,image_thumbnail,image_medium,image_full,scope,group_id,location,venue_name,address,venue_id,venues(address)";
    const metadataColumns = `${baseColumns},dance_scope,dance_genre,activity_type,dance_tags`;
    const dateRange = [
        `and(start_date.lte.${endDateStr},end_date.gte.${startDateStr})`,
        `and(start_date.gte.${startDateStr},start_date.lte.${endDateStr})`,
        `and(date.gte.${startDateStr},date.lte.${endDateStr})`,
    ].join(',');

    const buildQuery = (columns: string, useScopeColumn: boolean) => {
        let query = cafe24
            .from("events")
            .select(columns)
            .or(dateRange)
            .order("start_date", { ascending: true, nullsFirst: false });

        if (useScopeColumn) {
            query = normalizedScope === 'swing'
                ? query.or('dance_scope.eq.swing,dance_scope.is.null')
                : query.eq('dance_scope', normalizedScope);
        }
        return query;
    };

    let { data, error } = await buildQuery(metadataColumns, true);

    if (error) {
        const fallback = await buildQuery(baseColumns, false);
        data = fallback.data;
        error = fallback.error;
    }

    if (error) throw error;

    const allItems = ((data || []) as unknown as AppEvent[])
        .filter((event) => isEventInDanceScope(event as any, normalizedScope));

    // 분류: group_id 유무와 상관없이 모두 events로 통합 반환
    // FullEventCalendar 등에서 통합된 events 배열을 사용하여 렌더링함
    const events = allItems;
    const socialSchedules: any[] = [];

    return {
        events,
        socialSchedules
    };
};

/**
 * 캘린더 데이터를 서버에서 가져오거나 캐시에서 반환하는 React Query 훅입니다.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export const useCalendarEventsQuery = (currentMonth: Date, danceScope: DanceScope | string = 'swing') => {
    const queryClient = useQueryClient();
    const { startDateStr, endDateStr } = getCalendarRange(currentMonth);
    const normalizedScope = normalizeDanceScope(danceScope);

    // [New] 지능형 인접 월 프리페칭 (Smart Pre-fetching)
    // 현재 보고 있는 달의 전후 3개월 범위를 미리 로드하여 탐색 딜레이를 제거함
    useEffect(() => {
        const prefetch = async (offsetMonth: number) => {
            const targetDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offsetMonth, 1);
            const { startDateStr: s, endDateStr: e } = getCalendarRange(targetDate);

            queryClient.prefetchQuery({
                queryKey: ['calendar-events', CALENDAR_EVENTS_QUERY_VERSION, normalizedScope, s, e],
                queryFn: () => fetchCalendarEvents(s, e, normalizedScope),
                staleTime: 1000 * 30,
            });
        };

        // 전후 1개월씩 미리 로드
        prefetch(-1);
        prefetch(1);
    }, [currentMonth, normalizedScope, queryClient]);

    return useQuery<CalendarData>({
        queryKey: ['calendar-events', CALENDAR_EVENTS_QUERY_VERSION, normalizedScope, startDateStr, endDateStr],
        queryFn: () => fetchCalendarEvents(startDateStr, endDateStr, normalizedScope),
        staleTime: 1000 * 30,
        gcTime: 1000 * 60 * 60 * 24, // 24시간
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });
};
