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
        *,
        board_users(nickname)
      `;

            let query = supabase.from('events').select(selectFields);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                // Global fetch: allow custom minDate or default to today
                const baseDate = minDate ? new Date(minDate) : new Date();
                const baseDateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

                query = query.or(`date.gte.${baseDateStr},start_date.gte.${baseDateStr}`);

                // [Refined Filter] 
                // 1. group_id가 있는 모든 일정 (통합 소셜/강습 등)
                // 2. group_id가 없더라도 category가 class, club이 아닌 모든 일정 (일반 소셜 행사 등)
                query = query.or(`group_id.not.is.null,and(category.neq.class,category.neq.club)`);
            }

            const { data, error } = await query
                .order('date', { ascending: true })
                .order('time', { ascending: true });

            if (error) throw error;

            const fetchedData = (data || []).map((item: any) => ({
                ...item,
                start_time: item.time, // match SocialSchedule type
                place_name: item.location, // compatibility for legacy components
                link_url: item.link1,
                link_name: item.link_name1,
                image_url: item.image_medium || item.image || item.image_thumbnail
            })) as unknown as SocialSchedule[];
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

        const handleUpdate = (e: any) => {
            console.log('[useSocialSchedulesNew] Event detected, refreshing...');

            // 🎯 [IMMEDIATE UI UPDATE] Update local state before server fetch completes
            const updatedItem = e.detail?.event;
            const updatedId = e.detail?.id;

            if (updatedItem || updatedId) {
                setSchedules(prev => prev.map(item => {
                    const itemIdStr = String(item.id);
                    const targetIdStr = String(updatedId || updatedItem?.id);

                    // Match both raw ID and prefixed ID
                    const isMatch = itemIdStr === targetIdStr ||
                        itemIdStr === `social-${targetIdStr}` ||
                        `social-${itemIdStr}` === targetIdStr;

                    if (isMatch && updatedItem) {
                        return {
                            ...item,
                            ...updatedItem,
                            // Map events table fields to SocialSchedule fields if different
                            start_time: updatedItem.time || updatedItem.start_time || item.start_time,
                            place_name: updatedItem.location || updatedItem.place_name || item.place_name,
                            link_url: updatedItem.link1 || updatedItem.link_url || item.link_url,
                            link_name: updatedItem.link_name1 || updatedItem.link_name || item.link_name,
                            image_url: updatedItem.image_medium || updatedItem.image || updatedItem.image_thumbnail || item.image_url
                        };
                    }
                    return item;
                }));
            }

            fetchSchedules(true);
        };

        const handleDelete = (e: any) => {
            console.log('[useSocialSchedulesNew] handleDelete called:', e.detail);
            const deletedId = e.detail?.id || e.detail?.eventId;
            if (deletedId) {
                setSchedules(prev => prev.filter(item => {
                    const itemIdStr = String(item.id);
                    const targetIdStr = String(deletedId);
                    return itemIdStr !== targetIdStr &&
                        itemIdStr !== `social-${targetIdStr}` &&
                        `social-${itemIdStr}` !== targetIdStr;
                }));
            }
            fetchSchedules(true);
        };

        window.addEventListener('eventUpdated', handleUpdate);
        window.addEventListener('eventDeleted', handleDelete);

        return () => {
            window.removeEventListener('eventUpdated', handleUpdate);
            window.removeEventListener('eventDeleted', handleDelete);
        };
    }, [fetchSchedules]);

    return {
        schedules,
        loading,
        refresh: useCallback(() => fetchSchedules(true), [fetchSchedules])
    };
}
