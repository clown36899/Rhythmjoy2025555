import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { UnifiedSocialEvent } from '../types';
import { useAuth } from '../../../contexts/AuthContext';

// Helper: DB Row -> UnifiedSocialEvent 변환
const mapScheduleToEvent = (schedule: any): UnifiedSocialEvent | null => {
    let dow = schedule.day_of_week;
    if ((dow === null || dow === undefined) && schedule.date) {
        dow = new Date(schedule.date).getDay();
    }

    if (dow === null || dow === undefined) return null;

    const imageUrl = schedule.image_url;
    let imageUrlThumbnail = schedule.image_thumbnail || imageUrl;

    return {
        id: `schedule-${schedule.id}`,
        type: 'social',
        originalId: schedule.id,
        title: schedule.title,
        dayOfWeek: dow,
        startTime: schedule.start_time,
        placeName: schedule.place_name,
        inquiryContact: schedule.inquiry_contact,
        linkName: schedule.link_name,
        linkUrl: schedule.link_url,
        description: schedule.description,
        imageUrl: imageUrl,
        imageUrlThumbnail: imageUrlThumbnail,
        venueId: schedule.venue_id,
    };
};

export function useSocialSchedules() {
    const [events, setEvents] = useState<UnifiedSocialEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const { validateSession } = useAuth();

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('데이터 로딩 시간 초과 (10초)')), 10000)
            );

            const fetchPromise = supabase
                .from('social_schedules')
                .select(`
          id, title, date, start_time, day_of_week, 
          inquiry_contact, link_name, link_url, description, place_name, address, category, 
          image_url, image_micro, image_thumbnail, image_medium, image_full, venue_id
        `)
                .order('day_of_week', { ascending: true })
                .order('start_time', { ascending: true });

            // Type assertion for Promise.race result
            const result = await Promise.race([fetchPromise, timeoutPromise]) as any;

            // Check if result is from supabase (has data/error)
            const { data: placeSchedules, error } = result;

            if (error) throw error;

            const unifiedEvents: UnifiedSocialEvent[] = (placeSchedules || [])
                .map(mapScheduleToEvent)
                .filter((e: UnifiedSocialEvent | null): e is UnifiedSocialEvent => e !== null);

            setEvents(unifiedEvents);
        } catch (err: any) {
            console.error('스케줄 로딩 실패:', err);
            if (err.message && err.message.includes('시간 초과')) {
                console.warn('[useSocialSchedules] ⏱️ Timeout detected, verifying session integrity...');
                validateSession();
            }
        } finally {
            setLoading(false);
        }
    }, [validateSession]);

    // 낙관적 업데이트 함수들
    const addLocalEvent = useCallback((scheduleData: any) => {
        const newEvent = mapScheduleToEvent(scheduleData);
        if (newEvent) {
            setEvents(prev => [...prev, newEvent]);
        }
    }, []);

    const updateLocalEvent = useCallback((scheduleData: any) => {
        const updatedEvent = mapScheduleToEvent(scheduleData);
        if (updatedEvent) {
            setEvents(prev => prev.map(e =>
                (e.type === 'social' && e.originalId === updatedEvent.originalId) ? updatedEvent : e
            ));
        }
    }, []);

    const deleteLocalEvent = useCallback((originalId: number) => {
        setEvents(prev => prev.filter(e =>
            !(e.type === 'social' && e.originalId === originalId)
        ));
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    return {
        events,
        loading,
        refresh: fetchEvents,
        addLocalEvent,
        updateLocalEvent,
        deleteLocalEvent
    };
}
