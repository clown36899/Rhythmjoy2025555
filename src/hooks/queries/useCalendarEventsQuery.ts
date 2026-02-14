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
    // group_id, day_of_week, place_name(mapped to location) 등을 포함하여 events 단일 테이블 쿼리
    const columns = "id,title,date,start_date,end_date,event_dates,category,image_micro,image_thumbnail,image_medium,scope,group_id,day_of_week,location,venue_id";

    const { data, error } = await supabase
        .from("events")
        .select(columns)
        .or(`and(start_date.gte.${startDateStr},start_date.lte.${endDateStr}),and(end_date.gte.${startDateStr},end_date.lte.${endDateStr}),and(date.gte.${startDateStr},date.lte.${endDateStr})`)
        .order("start_date", { ascending: true, nullsFirst: false });

    if (error) throw error;

    const allItems = (data || []) as AppEvent[];

    // 분류: group_id가 있으면 socialSchedules로, 없으면 일반 events로
    // (이전 캘린더 로직이 socialSchedules를 별도 필드로 기대하므로 형식을 맞춰줌)
    const events = allItems.filter(item => !item.group_id);
    const socialSchedules = allItems.filter(item => !!item.group_id).map(item => ({
        ...item,
        place_name: item.location // social_schedules의 place_name은 events의 location에 매핑됨
    }));

    return {
        events,
        socialSchedules
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
