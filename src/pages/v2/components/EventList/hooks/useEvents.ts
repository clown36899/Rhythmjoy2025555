import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../../../../lib/supabase";
import { getLocalDateString } from "../../../utils/eventListUtils";
import type { Event } from "../../../utils/eventListUtils";

interface UseEventsProps {
    isAdminMode: boolean;
}

const STORAGE_KEY = 'v2_events_cache';
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

let globalEventsCache: Event[] | null = null;
let globalCacheTimestamp: number | null = null;

export function useEvents({ isAdminMode }: UseEventsProps) {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<Error | null>(null);

    const saveEventsToCache = (eventList: Event[]) => {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: eventList
            };
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData));
            globalEventsCache = eventList;
            globalCacheTimestamp = cacheData.timestamp;
        } catch (e) {
            console.error("Failed to save events to cache:", e);
        }
    };

    const loadEventsFromCache = (): Event[] | null => {
        try {
            if (globalEventsCache && globalCacheTimestamp && (Date.now() - globalCacheTimestamp < CACHE_DURATION)) {
                return globalEventsCache;
            }

            const cached = sessionStorage.getItem(STORAGE_KEY);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    globalEventsCache = data;
                    globalCacheTimestamp = timestamp;
                    return data;
                }
            }
        } catch (e) {
            console.error("Failed to load events from cache:", e);
        }
        return null;
    };

    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);

            // 1. 서버 측 필터링 구현: 최근 3개월 이내 데이터만 가져옴
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            const cutoffDate = getLocalDateString(threeMonthsAgo);

            const columns = "id, title, date, start_date, end_date, time, location, organizer, category, genre, image, created_at, user_id, venue_id, event_dates, description, video_url, organizer_phone, capacity, registered, link1, link2, link3, link_name1, link_name2, link_name3, password, show_title_on_billboard, storage_path, board_users(nickname), price, group_id, day_of_week, image_micro, image_thumbnail, image_medium, image_full";

            // Querying only 'events' table
            const { data, error } = await supabase
                .from("events")
                .select(columns)
                .or(`date.gte.${cutoffDate},end_date.gte.${cutoffDate},day_of_week.not.is.null`);

            if (error) throw error;

            const allItems = (data || []) as any[];

            // Map results for legacy compatibility if needed, though they are all in one table now.
            // Some UI parts might still expect 'social-' prefix for distinction.
            const processedList: Event[] = allItems.map(item => {
                if (item.group_id) {
                    return {
                        ...item,
                        id: item.id, // Unified ID (social- prefix removed)
                        start_date: item.start_date || item.date || null,
                        end_date: item.end_date || item.date || null,
                        time: item.time ? item.time.substring(0, 5) : null,
                        is_social_integrated: true
                    } as any;
                }
                return item as any;
            });

            setEvents(processedList);
            saveEventsToCache(processedList);
            setLoadError(null);
        } catch (err: any) {
            console.error("Error fetching events:", err);
            setLoadError(err);
            // Fallback to cache if network fails
            const cached = loadEventsFromCache();
            if (cached) setEvents(cached);
        } finally {
            setLoading(false);
        }
    }, [isAdminMode]);

    useEffect(() => {
        // Initial load
        const cached = loadEventsFromCache();
        if (cached) {
            setEvents(cached);
            setLoading(false);
            // Revalidation in background
            fetchEvents();
        } else {
            fetchEvents();
        }

        // Realtime Subscription for events table only
        const channel = supabase
            .channel('events-list-integrated')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'events' },
                () => {
                    fetchEvents();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchEvents]);

    // [Persistence] 앱 내부의 커스텀 이벤트(삭제/수정/생성) 수신 시 즉시 데이터 및 캐시 갱신
    useEffect(() => {
        const handleRefresh = () => {
            console.log('[useEvents] Custom event detected, refetching...');
            fetchEvents();
        };

        window.addEventListener('eventDeleted', handleRefresh);
        window.addEventListener('eventUpdated', handleRefresh);
        window.addEventListener('eventCreated', handleRefresh);

        return () => {
            window.removeEventListener('eventDeleted', handleRefresh);
            window.removeEventListener('eventUpdated', handleRefresh);
            window.removeEventListener('eventCreated', handleRefresh);
        };
    }, [fetchEvents]);

    return { events, loading, loadError, fetchEvents };
}
