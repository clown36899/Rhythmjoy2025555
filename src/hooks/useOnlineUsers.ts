import { useEffect, useState } from 'react';
import { subscribeToPresence } from './useOnlinePresence';

interface OnlineUser {
    session_id: string;
    user_id: string | null;
    anon_id?: string | null; // 비로그인 전용 영속 ID (6시간 TTL)
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

            // 로그인 사용자: user_id 기준 중복제거 (멀티탭 = 1명)
            const loggedInMap = new Map<string, OnlineUser>();
            allUsers
                .filter(u => u.type === 'logged_in' && !u.is_admin && u.user_id)
                .forEach(u => { if (!loggedInMap.has(u.user_id!)) loggedInMap.set(u.user_id!, u); });
            const loggedIn = Array.from(loggedInMap.values());

            // 비로그인 사용자: anon_id 기준 중복제거 (같은 브라우저 멀티탭 = 1명, 6시간 후 재방문 = +1)
            const anonMap = new Map<string, OnlineUser>();
            allUsers
                .filter(u => u.type === 'anonymous' && !u.is_admin)
                .forEach(u => {
                    const key = u.anon_id || u.session_id; // anon_id 없는 구형 클라이언트는 session_id로 폴백
                    if (!anonMap.has(key)) anonMap.set(key, u);
                });
            const anonymous = Array.from(anonMap.values());

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
