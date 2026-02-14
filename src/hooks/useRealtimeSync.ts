import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['events'] });
                queryClient.invalidateQueries({ queryKey: ['social-schedules'] });
                queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(eventsChannel);
        };
    }, [queryClient]);
};
