import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Event as AppEvent } from '../../lib/supabase';

export interface CalendarData {
    events: AppEvent[];
    socialSchedules: any[];
}

/**
 * 특정 날짜를 기준으로 달력에 필요한 3개월 범위(이전달, 현재달, 다음달)를 계산합니다.
 */
export const getCalendarRange = (date: Date) => {
    const startOfRange = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const endOfRange = new Date(date.getFullYear(), date.getMonth() + 2, 0);
    return {
        startDateStr: startOfRange.toISOString().split('T')[0],
        endDateStr: endOfRange.toISOString().split('T')[0]
    };
};

/**
 * 실제 데이터를 가져오는 핵심 비동기 함수입니다.
 */
export const fetchCalendarEvents = async (startDateStr: string, endDateStr: string) => {
    const columns = "id,title,date,start_date,end_date,event_dates,category,image_micro,image_thumbnail,image_medium,scope";

    const [eventsResult, socialResult] = await Promise.all([
        supabase
            .from("events")
            .select(columns)
            .or(`and(start_date.gte.${startDateStr},start_date.lte.${endDateStr}),and(end_date.gte.${startDateStr},end_date.lte.${endDateStr}),and(date.gte.${startDateStr},date.lte.${endDateStr})`)
            .order("start_date", { ascending: true, nullsFirst: false }),
        supabase
            .from("social_schedules")
            .select("id,title,date,image_micro,image_thumbnail,image_medium,day_of_week,place_name,venue_id,v2_category")
            .gte("date", startDateStr)
            .lte("date", endDateStr)
            .order("date", { ascending: true })
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (socialResult.error) throw socialResult.error;

    return {
        events: (eventsResult.data || []) as AppEvent[],
        socialSchedules: (socialResult.data || []) as any[]
    };
};

/**
 * 캘린더 데이터를 서버에서 가져오거나 캐시에서 반환하는 React Query 훅입니다.
 */
export const useCalendarEventsQuery = (currentMonth: Date) => {
    const { startDateStr, endDateStr } = getCalendarRange(currentMonth);

    return useQuery<CalendarData>({
        queryKey: ['calendar-events', startDateStr, endDateStr],
        queryFn: () => fetchCalendarEvents(startDateStr, endDateStr),
        staleTime: 1000 * 60 * 5, // 5분
        gcTime: 1000 * 60 * 60 * 24, // 24시간
    });
};
