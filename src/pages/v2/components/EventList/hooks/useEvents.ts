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

            const columns = "id, title, date, start_date, end_date, time, location, organizer, category, genre, image, created_at, user_id, venue_id, event_dates, description, video_url, organizer_phone, capacity, registered, link1, link2, link3, link_name1, link_name2, link_name3, password, show_title_on_billboard, storage_path, board_users(nickname), price";

            // Concurrent fetch for both tables
            const [eventsResult, socialResult] = await Promise.all([
                supabase
                    .from("events")
                    .select(columns)
                    .or(`date.gte.${cutoffDate},end_date.gte.${cutoffDate}`),
                supabase
                    .from("social_schedules")
                    .select("id, title, date, day_of_week, start_time, place_name, address, description, venue_id, image_url, image_micro, image_thumbnail, image_medium, image_full, user_id, created_at, link_url, link_name, v2_genre, v2_category, board_users(nickname), social_groups(name)")
                    .not("v2_genre", "is", null)
                    .or(`date.is.null,date.gte.${cutoffDate}`)
            ]);

            if (eventsResult.error) throw eventsResult.error;
            if (socialResult.error) throw socialResult.error;

            // Map social schedules to event format
            const mappedSocialEvents: Event[] = (socialResult.data || []).map(s => ({
                id: `social-${s.id}` as any, // Unique ID to avoid collisions with events table
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
                // Additional fields for compatibility
                is_social_integrated: true
            } as any));

            const combinedList = [...(eventsResult.data || []), ...mappedSocialEvents] as Event[];
            setEvents(combinedList);
            saveEventsToCache(combinedList);
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

        // Realtime Subscription for both tables
        const channel = supabase
            .channel('events-list-integrated')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'events' },
                () => {
                    fetchEvents();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'social_schedules' },
                () => {
                    fetchEvents();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchEvents]);

    return { events, loading, loadError, fetchEvents };
}
