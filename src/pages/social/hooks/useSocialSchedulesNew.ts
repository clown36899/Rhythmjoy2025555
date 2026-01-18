import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialSchedule } from '../types';
import { useAuth } from '../../../contexts/AuthContext';

// Global cache update to handle variable start dates
let globalSchedulesCache: {
    data: SocialSchedule[];
    timestamp: number;
    groupId: number | undefined;
    minDate: string | undefined;
} | null = null;

const CACHE_DURATION = 60 * 1000; // 1 minute

export function useSocialSchedulesNew(groupId?: number, minDate?: string) {
    const { isAdmin } = useAuth();
    const [schedules, setSchedules] = useState<SocialSchedule[]>(globalSchedulesCache?.data || []);
    // Determine if we need to load: invalid cache, diff group, or diff date range (if specific minDate requested)
    // Note: If minDate provided is NEWER than cached minDate, we might seemingly use cached data, 
    // but usually we move backwards (older minDate) -> invalidates.
    // Simplifying: if minDate differs, refetch.
    const [loading, setLoading] = useState(
        !globalSchedulesCache ||
        globalSchedulesCache.groupId !== groupId ||
        (minDate && globalSchedulesCache.minDate !== minDate)
    );

    const fetchSchedules = useCallback(async (force = false) => {
        // Use cache logic:
        // 1. Not forced
        // 2. Cache exists
        // 3. Group match
        // 4. Time valid
        // 5. MinDate matches (or we are asking for default/today and cache is default/today)
        const isCacheValid = globalSchedulesCache &&
            globalSchedulesCache.groupId === groupId &&
            globalSchedulesCache.minDate === minDate &&
            (Date.now() - globalSchedulesCache.timestamp < CACHE_DURATION);

        if (!force && isCacheValid && globalSchedulesCache) {
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
        v2_genre, v2_category,
        user_id, created_at, updated_at
      `;

            // 작성자 정보는 항상 가져옵니다. (UI에서 노출 제어)
            selectFields += `, board_users(nickname)`;

            let query = supabase.from('social_schedules').select(selectFields);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                // Global fetch: allow custom minDate or default to today
                const baseDate = minDate ? new Date(minDate) : new Date();
                const baseDateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

                // Fetch if: (date >= baseDate) OR (day_of_week is not null/recurring)
                query = query.or(`date.gte.${baseDateStr},day_of_week.not.is.null`);
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
                groupId: groupId,
                minDate: minDate
            };
        } catch (err) {
            console.error('Error fetching social schedules:', err);
        } finally {
            setLoading(false);
        }
    }, [groupId, isAdmin, minDate]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    return {
        schedules,
        loading,
        refresh: () => fetchSchedules(true)
    };
}
