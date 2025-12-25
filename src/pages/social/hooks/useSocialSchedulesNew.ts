import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialSchedule } from '../types';

export function useSocialSchedulesNew(groupId?: number) {
    const [schedules, setSchedules] = useState<SocialSchedule[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            // 복사 및 수정 기능을 위해 필수적인 데이터들은 포함해서 가져옵니다.
            let query = supabase.from('social_schedules').select(`
        id, group_id, title, date, day_of_week, start_time, 
        place_name, address, venue_id, description, image_url, image_micro, 
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
