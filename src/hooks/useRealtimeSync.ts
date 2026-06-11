import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { applyEventMutationToQueryCache } from '../utils/eventMutationSync';

export const useRealtimeSync = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        // Events 테이블 구독
        const eventsChannel = supabase
            .channel('events-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'events'
            }, (payload: any) => {
                const action = payload.eventType === 'DELETE'
                    ? 'deleted'
                    : payload.eventType === 'INSERT'
                        ? 'created'
                        : 'updated';
                const detail = action === 'deleted'
                    ? { eventId: payload.old?.id }
                    : { id: payload.new?.id, event: payload.new };

                applyEventMutationToQueryCache(queryClient, detail, action);
                queryClient.invalidateQueries({ queryKey: ['events'] });
                queryClient.invalidateQueries({ queryKey: ['social-schedules'] });
                queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
                queryClient.invalidateQueries({ queryKey: ['list-view-events'] });
            })
            .subscribe();

        const handleEventUpdated = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            applyEventMutationToQueryCache(queryClient, detail, 'updated');
            queryClient.invalidateQueries({ queryKey: ['events'] });
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
            queryClient.invalidateQueries({ queryKey: ['list-view-events'] });
        };

        const handleEventCreated = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            applyEventMutationToQueryCache(queryClient, detail, 'created');
            queryClient.invalidateQueries({ queryKey: ['events'] });
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
            queryClient.invalidateQueries({ queryKey: ['list-view-events'] });
        };

        const handleEventDeleted = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            applyEventMutationToQueryCache(queryClient, detail, 'deleted');
            queryClient.invalidateQueries({ queryKey: ['events'] });
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
            queryClient.invalidateQueries({ queryKey: ['list-view-events'] });
        };

        window.addEventListener('eventUpdated', handleEventUpdated);
        window.addEventListener('eventCreated', handleEventCreated);
        window.addEventListener('eventDeleted', handleEventDeleted);

        return () => {
            supabase.removeChannel(eventsChannel);
            window.removeEventListener('eventUpdated', handleEventUpdated);
            window.removeEventListener('eventCreated', handleEventCreated);
            window.removeEventListener('eventDeleted', handleEventDeleted);
        };
    }, [queryClient]);
};
