import { useQuery } from '@tanstack/react-query';
import { cafe24 } from '../../lib/cafe24Client';
import { fetchCafe24Events, isCafe24EventsBackendEnabled } from '../../lib/cafe24EventsApi';
import { getLocalDateString } from '../../pages/v2/utils/eventListUtils';
import type { Event } from '../../pages/v2/utils/eventListUtils';

export const useEventsQuery = () => {
    return useQuery({
        queryKey: ['events', 'dance-expansion-local-v5-author-profile'],
        queryFn: async () => {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            const cutoffDate = getLocalDateString(threeMonthsAgo);

            if (isCafe24EventsBackendEnabled) {
                return (await fetchCafe24Events({ cutoff: cutoffDate, limit: 3000 })) as Event[];
            }

            // Fetch only from events table (now containing both events and social schedules)
            const { data, error } = await cafe24
                .from('events')
                .select('*, board_users(nickname, profile_image)')
                .or(`date.gte.${cutoffDate},end_date.gte.${cutoffDate},start_date.gte.${cutoffDate}`);

            if (error) throw error;

            return (data || []) as Event[];
        },
        staleTime: 60000,
        gcTime: 3600000,
        placeholderData: (previousData) => previousData, // refetch 중에도 이전 데이터 유지
    });
};
