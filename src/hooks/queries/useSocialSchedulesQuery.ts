import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { SocialSchedule } from '../../pages/social/types';

export const useSocialSchedulesQuery = (groupId?: number) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        const handleUpdate = () => {
            console.log('[useSocialSchedulesQuery] Event detected, invalidating query...');
            queryClient.invalidateQueries({ queryKey: ['social-schedules'] });
        };

        window.addEventListener('eventUpdated', handleUpdate);
        window.addEventListener('eventDeleted', handleUpdate);

        return () => {
            window.removeEventListener('eventUpdated', handleUpdate);
            window.removeEventListener('eventDeleted', handleUpdate);
        };
    }, [queryClient]);

    return useQuery({
        queryKey: groupId ? ['social-schedules', groupId] : ['social-schedules'],
        queryFn: async () => {
            const selectFields = `
        id, group_id, title, date, start_date, day_of_week, time, 
        place_name:location, address, location_link, venue_id, description, 
        image_url:image_medium, image_micro, image_thumbnail, image_medium, image_full,
        link_url:link1, link_name:link_name1,
        user_id, created_at, updated_at, board_users(nickname),
        category, genre, scope
      `;

            let query = supabase.from('events').select(selectFields).not('group_id', 'is', null);

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
                .order('time', { ascending: true });

            if (error) throw error;

            const fetchedData = (data || []).map((item: any) => ({
                ...item,
                start_time: item.time, // match SocialSchedule type & legacy UI
                place_name: item.location // compatibility for legacy components
            })) as unknown as SocialSchedule[];

            return fetchedData;
        },
        staleTime: 60000, // 1분
        gcTime: 3600000, // 1시간
    });
};
