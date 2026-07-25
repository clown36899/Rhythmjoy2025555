import { useCallback, useEffect, useState } from 'react';
import { cafe24 } from '../lib/cafe24Client';

export function useFreeBoardUnreadCount() {
    const [count, setCount] = useState(0);

    const loadCount = useCallback(async () => {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { count: recentCount, error } = await cafe24
            .from('board_posts')
            .select('id', { count: 'exact', head: true })
            .eq('category', 'free')
            .gte('created_at', fourteenDaysAgo);

        if (!error) setCount(recentCount || 0);
    }, []);

    useEffect(() => {
        void loadCount();
    }, [loadCount]);

    useEffect(() => {
        const channel = cafe24
            .channel('free-board-bottom-nav-activity')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'board_posts', filter: 'category=eq.free' },
                () => {
                    void loadCount();
                },
            )
            .subscribe();

        return () => {
            cafe24.removeChannel(channel);
        };
    }, [loadCount]);

    return count;
}
