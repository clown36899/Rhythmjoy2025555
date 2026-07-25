import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cafe24 } from '../lib/cafe24Client';

const LAST_SEEN_KEY = 'swingenjoy:free-board:last-seen';

const isFreeBoardLocation = (pathname: string, search: string) => {
    if (pathname !== '/board') return false;
    const category = new URLSearchParams(search).get('category');
    return !category || category === 'free';
};

export function useFreeBoardUnreadCount() {
    const location = useLocation();
    const [count, setCount] = useState(0);
    const isViewingFreeBoard = isFreeBoardLocation(location.pathname, location.search);

    const markAsSeen = useCallback(() => {
        localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
        setCount(0);
    }, []);

    const loadCount = useCallback(async () => {
        if (isViewingFreeBoard) {
            markAsSeen();
            return;
        }

        const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
        if (!lastSeen) {
            localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
            setCount(0);
            return;
        }

        const { count: unreadCount, error } = await cafe24
            .from('board_posts')
            .select('id', { count: 'exact', head: true })
            .eq('category', 'free')
            .eq('is_hidden', false)
            .gt('created_at', lastSeen);

        if (!error) setCount(unreadCount || 0);
    }, [isViewingFreeBoard, markAsSeen]);

    useEffect(() => {
        void loadCount();
    }, [loadCount]);

    useEffect(() => {
        const channel = cafe24
            .channel('free-board-bottom-nav-activity')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'board_posts', filter: 'category=eq.free' },
                (payload: { new?: { is_hidden?: boolean } }) => {
                    if (payload.new?.is_hidden) return;
                    if (isViewingFreeBoard) {
                        markAsSeen();
                    } else {
                        setCount((current) => current + 1);
                    }
                },
            )
            .subscribe();

        return () => {
            cafe24.removeChannel(channel);
        };
    }, [isViewingFreeBoard, markAsSeen]);

    useEffect(() => {
        const syncCount = () => void loadCount();
        window.addEventListener('storage', syncCount);
        return () => {
            window.removeEventListener('storage', syncCount);
        };
    }, [loadCount]);

    return count;
}
