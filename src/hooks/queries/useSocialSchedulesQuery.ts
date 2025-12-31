import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { SocialSchedule } from '../../pages/social/types';

export const useSocialSchedulesQuery = (groupId?: number) => {
    return useQuery({
        queryKey: groupId ? ['social-schedules', groupId] : ['social-schedules'],
        queryFn: async () => {
            let selectFields = `
        id, group_id, title, date, day_of_week, start_time, 
        place_name, address, venue_id, description, 
        image_url, image_micro, image_thumbnail, image_medium, image_full,
        link_url, link_name,
        user_id, created_at, updated_at, board_users(nickname)
      `;

            let query = supabase.from('social_schedules').select(selectFields);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                // Global fetch: Optimize by fetching only future/today events or recurring schedules
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                query = query.or(`date.gte.${todayStr},day_of_week.not.is.null`);
            }

            const { data, error } = await query
                .order('date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;
            return (data || []) as unknown as SocialSchedule[];
        },
        staleTime: 60000, // 1분
        gcTime: 3600000, // 1시간
    });
};
