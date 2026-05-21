import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Event as AppEvent } from '../../lib/supabase';
import { isEventInDanceScope, normalizeDanceScope, type DanceScope } from '../../utils/danceTaxonomy';

const LIST_VIEW_EVENTS_QUERY_VERSION = 'dance-scope-local-v4';

export function useListViewEvents(enabled: boolean, danceScope: DanceScope | string = 'swing') {
    const today = new Date().toLocaleDateString('en-CA');
    const normalizedScope = normalizeDanceScope(danceScope);

    return useQuery({
        queryKey: ['list-view-events', LIST_VIEW_EVENTS_QUERY_VERSION, normalizedScope, today],
        enabled,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const baseColumns = "id,title,date,start_date,end_date,event_dates,category,image_micro,image_thumbnail,image_medium,scope,group_id,location,venue_name,address,venue_id,genre";
            const metadataColumns = `${baseColumns},dance_scope,dance_genre,activity_type,dance_tags`;
            const dateRange = `start_date.gte.${today},date.gte.${today},end_date.gte.${today}`;

            const buildQuery = (columns: string, useScopeColumn: boolean) => {
                let query = supabase
                    .from("events")
                    .select(columns)
                    .or(dateRange)
                    .order('start_date', { ascending: true, nullsFirst: false });

                if (useScopeColumn) {
                    query = normalizedScope === 'swing'
                        ? query.or('dance_scope.eq.swing,dance_scope.is.null')
                        : query.eq('dance_scope', normalizedScope);
                }
                return query;
            };

            // 오늘 이후 모든 이벤트:
            // end_date >= today (종료일 기준)
            // 또는 end_date 없고 start_date >= today
            // 또는 둘 다 없고 date >= today
            let { data: events, error } = await buildQuery(metadataColumns, true);

            if (error) {
                const fallback = await buildQuery(baseColumns, false);
                events = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;

            return {
                events: ((events || []) as unknown as AppEvent[]).filter((event) => isEventInDanceScope(event as any, normalizedScope)),
                socialSchedules: [],
            };
        },
    });
}
