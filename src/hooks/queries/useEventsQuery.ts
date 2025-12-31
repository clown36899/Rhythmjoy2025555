import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../pages/v2/utils/eventListUtils';
import type { Event } from '../../pages/v2/utils/eventListUtils';

export const useEventsQuery = () => {
    return useQuery({
        queryKey: ['events'],
        queryFn: async () => {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            const cutoffDate = getLocalDateString(threeMonthsAgo);

            const { data, error } = await supabase
                .from('events')
                .select('*, board_users(nickname)')
                .or(`date.gte.${cutoffDate},end_date.gte.${cutoffDate}`);

            if (error) throw error;
            return (data || []) as Event[];
        },
        staleTime: 60000, // 1분
        gcTime: 3600000, // 1시간
    });
};
