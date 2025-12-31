import { useEffect, useState } from 'react';
import { subscribeToPresence } from './useOnlinePresence';

interface OnlineUser {
    session_id: string;
    user_id: string | null;
    nickname: string | null;
    profile_image_url: string | null;
    type: 'logged_in' | 'anonymous';
    is_admin?: boolean; // 관리자 여부 추가
    online_at: string;
}

interface OnlineUsersData {
    loggedInUsers: OnlineUser[];
    anonymousCount: number;
    totalCount: number;
}

// 이 훅은 무조건 최상위 레벨에서 호출되어야 하며, 내부에서 조건부로 훅을 호출하면 안됨.
export function useOnlineUsers(): OnlineUsersData {
    const [onlineUsers, setOnlineUsers] = useState<OnlineUsersData>({
        loggedInUsers: [],
        anonymousCount: 0,
        totalCount: 0,
    });

    useEffect(() => {
        // 전역 상태 구독
        const unsubscribe = subscribeToPresence((state) => {
            if (!state) return;

            const allUsers: OnlineUser[] = [];

            Object.values(state).forEach((presences: any) => {
                presences.forEach((p: any) => allUsers.push(p));
            });

            // 관리자 제외 필터링 (is_admin이 true인 사용자는 카운트에서 제외)
            const loggedIn = allUsers.filter(u => u.type === 'logged_in' && !u.is_admin);
            const anonymous = allUsers.filter(u => u.type === 'anonymous' && !u.is_admin);

            setOnlineUsers({
                loggedInUsers: loggedIn,
                anonymousCount: anonymous.length,
                totalCount: loggedIn.length + anonymous.length // 관리자 제외된 총합
            });
        });

        return () => { unsubscribe(); };
    }, []); // 빈 배열: 마운트 시 한 번만 실행 (안전)

    return onlineUsers;
}
