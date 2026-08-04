import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cafe24 } from '../lib/cafe24Client';

export const FREE_BOARD_READ_EVENT = 'swingenjoy:free-board-read';
const GUEST_READ_STORAGE_KEY = 'swingenjoy:free-board-read-posts:v1';
const READ_SYNC_STORAGE_KEY = 'swingenjoy:free-board-read-sync:v1';
const READ_SYNC_CHANNEL = 'swingenjoy-free-board-read';
const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function getGuestReadIds() {
    try {
        const parsed = JSON.parse(localStorage.getItem(GUEST_READ_STORAGE_KEY) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
        return new Set<string>();
    }
}

function saveGuestReadId(postId: string) {
    const next = getGuestReadIds();
    next.add(postId);
    localStorage.setItem(GUEST_READ_STORAGE_KEY, JSON.stringify([...next].slice(-500)));
}

function emitFreeBoardRead(postId: string) {
    window.dispatchEvent(new CustomEvent(FREE_BOARD_READ_EVENT, { detail: { postId } }));
    try {
        localStorage.setItem(READ_SYNC_STORAGE_KEY, JSON.stringify({ postId, at: Date.now() }));
        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel(READ_SYNC_CHANNEL);
            channel.postMessage({ postId });
            channel.close();
        }
    } catch {
        // 같은 탭 CustomEvent는 이미 전달됐으므로 저장소 차단은 읽음 자체를 막지 않는다.
    }
}

export async function markFreeBoardPostRead(postId: number | string) {
    const normalizedId = String(postId);
    const { data: { user } } = await cafe24.auth.getUser();
    if (user?.id) {
        const response = await fetch('/api/board/free/read', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: normalizedId }),
        });
        if (!response.ok) throw new Error(`자유게시판 읽음 저장 실패 (${response.status})`);
    } else {
        saveGuestReadId(normalizedId);
    }
    emitFreeBoardRead(normalizedId);
}

export function useMarkFreeBoardPostRead(
    postId: number | string | null | undefined,
    category: string | null | undefined,
    active = true,
) {
    useEffect(() => {
        if (!active || !postId || category !== 'free') return;
        void markFreeBoardPostRead(postId).catch((error) => {
            console.warn('[FreeBoardRead] Failed to mark visible post read:', error);
        });
    }, [active, category, postId]);
}

export function useFreeBoardUnreadState() {
    const { user } = useAuth();
    const [unreadPostIds, setUnreadPostIds] = useState<Set<string>>(new Set());

    const loadUnread = useCallback(async () => {
        try {
            if (user?.id) {
                const response = await fetch('/api/board/free/unread', {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) {
                    if (response.status === 401) setUnreadPostIds(new Set());
                    return;
                }
                const payload = await response.json();
                setUnreadPostIds(new Set((payload.unreadPostIds || []).map(String)));
                return;
            }

            const fourteenDaysAgo = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
            const { data, error } = await cafe24
                .from('board_posts')
                .select('id, is_hidden')
                .eq('category', 'free')
                .eq('is_hidden', false)
                .gte('created_at', fourteenDaysAgo);
            if (error) return;
            const readIds = getGuestReadIds();
            setUnreadPostIds(new Set((data || []).map((post: any) => String(post.id)).filter((id: string) => !readIds.has(id))));
        } catch (error) {
            // 모바일 화면 복귀 직후의 일시적 fetch 실패는 기존 배지 상태를 유지한다.
            console.warn('[FreeBoardRead] Failed to refresh unread state:', error);
        }
    }, [user?.id]);

    useEffect(() => {
        void loadUnread();
    }, [loadUnread]);

    useEffect(() => {
        const handleRead = (event: Event) => {
            const postId = String((event as CustomEvent)?.detail?.postId || '');
            if (!postId) return;
            setUnreadPostIds((current) => {
                const next = new Set(current);
                next.delete(postId);
                return next;
            });
        };
        const channel = cafe24
            .channel('free-board-bottom-nav-activity')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'board_posts', filter: 'category=eq.free' },
                () => { void loadUnread(); },
            )
            .subscribe();
        const readChannel = 'BroadcastChannel' in window
            ? new BroadcastChannel(READ_SYNC_CHANNEL)
            : null;
        const handleBroadcastRead = (event: MessageEvent) => {
            handleRead(new CustomEvent(FREE_BOARD_READ_EVENT, { detail: event.data }));
        };
        const handleStorageRead = (event: StorageEvent) => {
            if (event.key !== READ_SYNC_STORAGE_KEY || !event.newValue) return;
            try {
                handleRead(new CustomEvent(FREE_BOARD_READ_EVENT, { detail: JSON.parse(event.newValue) }));
            } catch {
                void loadUnread();
            }
        };
        let resumeRefreshTimer: number | null = null;
        const scheduleResumeRefresh = () => {
            if (document.visibilityState !== 'visible') return;
            if (resumeRefreshTimer !== null) window.clearTimeout(resumeRefreshTimer);
            // Android Chrome가 foreground로 돌아온 뒤 네트워크가 안정될 시간을 준다.
            resumeRefreshTimer = window.setTimeout(() => {
                resumeRefreshTimer = null;
                void loadUnread();
            }, 800);
        };
        readChannel?.addEventListener('message', handleBroadcastRead);
        window.addEventListener(FREE_BOARD_READ_EVENT, handleRead);
        window.addEventListener('storage', handleStorageRead);
        window.addEventListener('focus', scheduleResumeRefresh);
        window.addEventListener('online', scheduleResumeRefresh);
        document.addEventListener('visibilitychange', scheduleResumeRefresh);
        return () => {
            if (resumeRefreshTimer !== null) window.clearTimeout(resumeRefreshTimer);
            readChannel?.removeEventListener('message', handleBroadcastRead);
            readChannel?.close();
            window.removeEventListener(FREE_BOARD_READ_EVENT, handleRead);
            window.removeEventListener('storage', handleStorageRead);
            window.removeEventListener('focus', scheduleResumeRefresh);
            window.removeEventListener('online', scheduleResumeRefresh);
            document.removeEventListener('visibilitychange', scheduleResumeRefresh);
            cafe24.removeChannel(channel);
        };
    }, [loadUnread]);

    return { count: unreadPostIds.size, unreadPostIds };
}

export function useFreeBoardUnreadCount() {
    return useFreeBoardUnreadState().count;
}
