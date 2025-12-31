import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialSchedule } from '../types';
import { useAuth } from '../../../contexts/AuthContext';

// Global cache for social schedules to avoid redundant fetches across components
let globalSchedulesCache: {
    data: SocialSchedule[];
    timestamp: number;
    groupId: number | undefined;
} | null = null;

const CACHE_DURATION = 60 * 1000; // 1 minute

export function useSocialSchedulesNew(groupId?: number) {
    const { isAdmin } = useAuth();
    const [schedules, setSchedules] = useState<SocialSchedule[]>(globalSchedulesCache?.data || []);
    const [loading, setLoading] = useState(!globalSchedulesCache || globalSchedulesCache.groupId !== groupId);

    const fetchSchedules = useCallback(async (force = false) => {
        // Use cache if available and not expired (unless force refresh)
        if (!force && globalSchedulesCache &&
            globalSchedulesCache.groupId === groupId &&
            Date.now() - globalSchedulesCache.timestamp < CACHE_DURATION) {
            setSchedules(globalSchedulesCache.data);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            let selectFields = `
        id, group_id, title, date, day_of_week, start_time, 
        place_name, address, venue_id, description, 
        image_url, image_micro, image_thumbnail, image_medium, image_full,
        link_url, link_name,
        user_id, created_at, updated_at
      `;

            if (isAdmin) {
                selectFields += `, board_users(nickname)`;
            }

            let query = supabase.from('social_schedules').select(selectFields);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                // Global fetch (Home Page): Optimize by fetching only future/today events or recurring schedules
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                // Fetch if: (date >= today) OR (day_of_week is not null/recurring)
                // Note: .or() filter string syntax using Supabase PostgREST format
                query = query.or(`date.gte.${todayStr},day_of_week.not.is.null`);
            }

            const { data, error } = await query
                .order('date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;

            const fetchedData = (data || []) as unknown as SocialSchedule[];
            setSchedules(fetchedData);

            // Update global cache
            globalSchedulesCache = {
                data: fetchedData,
                timestamp: Date.now(),
                groupId: groupId
            };
        } catch (err) {
            console.error('Error fetching social schedules:', err);
        } finally {
            setLoading(false);
        }
    }, [groupId, isAdmin]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    return {
        schedules,
        loading,
        refresh: () => fetchSchedules(true)
    };
}
