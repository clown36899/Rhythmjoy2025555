import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { UnifiedSocialEvent } from '../types';

// Helper: DB Row -> UnifiedSocialEvent 변환
const mapScheduleToEvent = (schedule: any): UnifiedSocialEvent | null => {
    let dow = schedule.day_of_week;
    if ((dow === null || dow === undefined) && schedule.date) {
        dow = new Date(schedule.date).getDay();
    }

    if (dow === null || dow === undefined) return null;

    return {
        id: `schedule-${schedule.id}`,
        type: 'schedule',
        originalId: schedule.id,
        title: schedule.title,
        dayOfWeek: dow,
        startTime: schedule.start_time,
        placeName: schedule.place_name,
        inquiryContact: schedule.inquiry_contact,
        linkName: schedule.link_name,
        linkUrl: schedule.link_url,
        description: schedule.description,
        imageUrl: schedule.image,
    };
};

export function useSocialSchedules() {
    const [events, setEvents] = useState<UnifiedSocialEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const { data: placeSchedules, error } = await supabase
                .from('social_schedules')
                .select(`
          id, title, date, start_time, day_of_week, 
          inquiry_contact, link_name, link_url, description, place_name, address, category, image
        `)
                .order('day_of_week', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;

            const unifiedEvents: UnifiedSocialEvent[] = (placeSchedules || [])
                .map(mapScheduleToEvent)
                .filter((e): e is UnifiedSocialEvent => e !== null);

            setEvents(unifiedEvents);
        } catch (err) {
            console.error('스케줄 로딩 실패:', err);
        } finally {
            setLoading(false);
        }
    }, []);

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
                (e.type === 'schedule' && e.originalId === updatedEvent.originalId) ? updatedEvent : e
            ));
        }
    }, []);

    const deleteLocalEvent = useCallback((originalId: number) => {
        setEvents(prev => prev.filter(e =>
            !(e.type === 'schedule' && e.originalId === originalId)
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
