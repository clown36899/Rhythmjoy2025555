import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for tracking online presence
 * Automatically registers user presence and cleans up on unmount
 */
export function useOnlinePresence() {
    const { user, userProfile } = useAuth();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const sessionIdRef = useRef<string>(crypto.randomUUID());

    useEffect(() => {
        // Create and subscribe to presence channel
        const channel = supabase.channel('online-users');
        channelRef.current = channel;

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Track presence with user info or anonymous
                await channel.track({
                    session_id: sessionIdRef.current,
                    user_id: user?.id || null,
                    nickname: userProfile?.nickname || null,
                    profile_image_url: userProfile?.profile_image || null,
                    type: user ? 'logged_in' : 'anonymous',
                    online_at: new Date().toISOString(),
                });
            }
        });

        // Cleanup on unmount
        return () => {
            if (channelRef.current) {
                channelRef.current.untrack();
                channelRef.current.unsubscribe();
            }
        };
    }, [user?.id, userProfile?.nickname, userProfile?.profile_image]);
}
