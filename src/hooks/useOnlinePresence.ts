import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Global channel - shared across all components
export let globalPresenceChannel: RealtimeChannel | null = null;
const sessionId = crypto.randomUUID();

/**
 * Hook for tracking online presence
 * Uses a global channel to avoid recreating on every mount
 */
export function useOnlinePresence() {
    const { user, userProfile } = useAuth();
    const isSubscribed = useRef(false);
    const lastTrackedData = useRef<string>('');

    // Create channel once globally
    useEffect(() => {
        if (globalPresenceChannel) {
            return;
        }

        globalPresenceChannel = supabase.channel('online-users');

        globalPresenceChannel.on('presence', { event: 'sync' }, () => {
            // Presence synced
        });

        globalPresenceChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                isSubscribed.current = true;
            }
        });

        return () => {
            // Keep global channel alive
        };
    }, []);

    // Update presence whenever user/profile changes
    useEffect(() => {
        if (!globalPresenceChannel || !isSubscribed.current) return;

        const presenceData = {
            session_id: sessionId,
            user_id: user?.id || null,
            nickname: userProfile?.nickname || null,
            profile_image_url: userProfile?.profile_image || null,
            type: user ? 'logged_in' : 'anonymous',
            online_at: new Date().toISOString(),
        };

        // Only update if data actually changed
        const dataKey = `${presenceData.user_id}-${presenceData.nickname}-${presenceData.profile_image_url}`;
        if (lastTrackedData.current === dataKey) {
            return; // Skip if nothing changed
        }

        lastTrackedData.current = dataKey;
        globalPresenceChannel.track(presenceData);
    }, [user?.id, userProfile?.nickname, userProfile?.profile_image]);
}
