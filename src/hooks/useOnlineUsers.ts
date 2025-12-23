import { useEffect, useState } from 'react';
import { globalPresenceChannel } from './useOnlinePresence';

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

    useEffect(() => {
        console.log('[OnlineUsers] Starting presence polling...');

        const updatePresenceState = () => {
            if (!globalPresenceChannel) return;

            const state = globalPresenceChannel.presenceState<OnlineUser>();

            // Extract all users from presence state
            const allUsers: OnlineUser[] = [];
            Object.values(state).forEach((presences) => {
                presences.forEach((presence) => {
                    allUsers.push(presence);
                });
            });
            // console.log('[OnlineUsers] All users:', allUsers); // Debug only

            // Separate logged-in users and anonymous users
            const loggedIn = allUsers.filter((u) => u.type === 'logged_in');
            const anonymous = allUsers.filter((u) => u.type === 'anonymous');

            setOnlineUsers({
                loggedInUsers: loggedIn,
                anonymousCount: anonymous.length,
                totalCount: allUsers.length,
            });
        };

        // Initial update
        updatePresenceState();

        // Poll every 2 seconds for updates
        const interval = setInterval(updatePresenceState, 2000);

        return () => {
            console.log('[OnlineUsers] Stopping presence polling');
            clearInterval(interval);
        };
    }, []);

    return onlineUsers;
}
