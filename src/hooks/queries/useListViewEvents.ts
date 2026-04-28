import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Event as AppEvent } from '../../lib/supabase';

export function useListViewEvents(enabled: boolean) {
    const today = new Date().toLocaleDateString('en-CA');

    return useQuery({
        queryKey: ['list-view-events', today],
        enabled,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const columns = "id,title,date,start_date,end_date,event_dates,category,image_micro,image_thumbnail,image_medium,scope,group_id,location,venue_name,address,venue_id,genre";

            // 오늘 이후 모든 이벤트:
            // end_date >= today (종료일 기준)
            // 또는 end_date 없고 start_date >= today
            // 또는 둘 다 없고 date >= today
            const { data: events, error } = await supabase
                .from("events")
                .select(columns)
                .or(`start_date.gte.${today},date.gte.${today}`)
                .order('start_date', { ascending: true, nullsFirst: false });

            if (error) throw error;

            return {
                events: (events || []) as unknown as AppEvent[],
                socialSchedules: [],
            };
        },
    });
}
