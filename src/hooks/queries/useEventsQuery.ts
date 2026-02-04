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

            // Fetch from both tables
            const [eventsResult, socialResult] = await Promise.all([
                supabase
                    .from('events')
                    .select('*, board_users(nickname)')
                    .or(`date.gte.${cutoffDate},end_date.gte.${cutoffDate}`),
                supabase
                    .from("social_schedules")
                    .select("id, title, date, day_of_week, start_time, place_name, address, description, venue_id, image_url, image_micro, image_thumbnail, image_medium, image_full, user_id, created_at, link_url, link_name, v2_genre, v2_category, board_users(nickname), social_groups(name)")
                    .not("v2_genre", "is", null)
                    .or(`date.is.null,date.gte.${cutoffDate}`)
            ]);

            if (eventsResult.error) throw eventsResult.error;
            if (socialResult.error) throw socialResult.error;

            // Map social schedules to Event type
            const mappedSocialEvents: Event[] = (socialResult.data || []).map(s => ({
                id: `social-${s.id}` as any,
                title: s.title,
                date: s.date || null,
                start_date: s.date || null,
                end_date: s.date || null,
                time: s.start_time ? s.start_time.substring(0, 5) : null,
                location: s.place_name || '',
                organizer: (Array.isArray(s.social_groups) ? (s.social_groups[0] as any)?.name : (s.social_groups as any)?.name) ||
                    (Array.isArray(s.board_users) ? (s.board_users[0] as any)?.nickname : (s.board_users as any)?.nickname) ||
                    '단체소셜',
                category: s.v2_category as any || 'club',
                genre: s.v2_genre || '',
                image: s.image_full || s.image_url || '',
                image_micro: s.image_micro,
                image_thumbnail: s.image_thumbnail,
                image_medium: s.image_medium,
                image_full: s.image_full,
                created_at: s.created_at,
                user_id: s.user_id,
                venue_id: s.venue_id ? String(s.venue_id) : null,
                description: s.description,
                link1: s.link_url,
                link_name1: s.link_name,
                board_users: Array.isArray(s.board_users) ? s.board_users[0] : s.board_users,
                is_social_integrated: true,
                day_of_week: s.day_of_week
            } as any));

            const combined = [...(eventsResult.data || []), ...mappedSocialEvents] as Event[];
            return combined;
        },
        staleTime: 60000,
        gcTime: 3600000,
        placeholderData: (previousData) => previousData, // refetch 중에도 이전 데이터 유지
    });
};
