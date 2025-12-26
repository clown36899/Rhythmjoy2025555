import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialSchedule } from '../types';

export function useSocialSchedulesNew(groupId?: number) {
    const [schedules, setSchedules] = useState<SocialSchedule[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            // 모든 이미지 사이즈(micro, thumbnail, medium, full)를 포함하여 조회합니다.
            let query = supabase.from('social_schedules').select(`
        id, group_id, title, date, day_of_week, start_time, 
        place_name, address, venue_id, description, 
        image_url, image_micro, image_thumbnail, image_medium, image_full,
        link_url, link_name,
        user_id, created_at, updated_at
      `);

            if (groupId) {
                query = query.eq('group_id', groupId);
            }

            const { data, error } = await query
                .order('date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;
            setSchedules((data as SocialSchedule[]) || []);
        } catch (err) {
            console.error('Error fetching social schedules:', err);
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    return {
        schedules,
        loading,
        refresh: fetchSchedules
    };
}
