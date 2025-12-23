import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface OnlineUser {
    session_id: string;
    user_id: string | null;
    nickname: string | null;
    profile_image_url: string | null;
    type: 'logged_in' | 'anonymous';
    online_at: string;
}

interface OnlineUsersData {
    loggedInUsers: OnlineUser[];
    anonymousCount: number;
    totalCount: number;
}

/**
 * Hook for subscribing to online users (admin only)
 * Returns real-time list of online users
 */
export function useOnlineUsers(): OnlineUsersData {
    const [onlineUsers, setOnlineUsers] = useState<OnlineUsersData>({
        loggedInUsers: [],
        anonymousCount: 0,
        totalCount: 0,
    });
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        const channel = supabase.channel('online-users');
        channelRef.current = channel;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState<OnlineUser>();

                // Extract all users from presence state
                const allUsers: OnlineUser[] = [];
                Object.values(state).forEach((presences) => {
                    presences.forEach((presence) => {
                        allUsers.push(presence);
                    });
                });

                // Separate logged-in users and anonymous users
                const loggedIn = allUsers.filter((u) => u.type === 'logged_in');
                const anonymous = allUsers.filter((u) => u.type === 'anonymous');

                setOnlineUsers({
                    loggedInUsers: loggedIn,
                    anonymousCount: anonymous.length,
                    totalCount: allUsers.length,
                });
            })
            .subscribe();

        return () => {
            if (channelRef.current) {
                channelRef.current.unsubscribe();
            }
        };
    }, []);

    return onlineUsers;
}
