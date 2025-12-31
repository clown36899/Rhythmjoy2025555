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
            })
            .subscribe();

        // Social Schedules 테이블 구독
        const socialsChannel = supabase
            .channel('socials-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'social_schedules'
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['social-schedules'] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(eventsChannel);
            supabase.removeChannel(socialsChannel);
        };
    }, [queryClient]);
};
