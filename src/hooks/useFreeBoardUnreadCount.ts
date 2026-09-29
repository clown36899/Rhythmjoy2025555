import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cafe24 } from '../lib/cafe24Client';
import { FREE_BOARD_RECENT_WINDOW_MS as RECENT_WINDOW_MS, getFreeBoardUnreadActivity } from '../utils/freeBoardActivity.mjs';

export const FREE_BOARD_READ_EVENT = 'swingenjoy:free-board-read';
const GUEST_READ_STORAGE_KEY = 'swingenjoy:free-board-read-posts:v1';
const GUEST_COMMENT_READ_STORAGE_KEY = 'swingenjoy:free-board-read-comments:v1';
const READ_SYNC_STORAGE_KEY = 'swingenjoy:free-board-read-sync:v1';
const READ_SYNC_CHANNEL = 'swingenjoy-free-board-read';

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

function getGuestReadCommentIds(): Set<string> {
    try {
        const ids = JSON.parse(localStorage.getItem(GUEST_COMMENT_READ_STORAGE_KEY) || '[]');
        return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch { return new Set(); }
}

function emitFreeBoardRead(postId: string, userId: string | null) {
    const detail = { postId, userId };
    window.dispatchEvent(new CustomEvent(FREE_BOARD_READ_EVENT, { detail }));
    try {
        localStorage.setItem(READ_SYNC_STORAGE_KEY, JSON.stringify({ ...detail, at: Date.now() }));
        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel(READ_SYNC_CHANNEL);
            channel.postMessage(detail);
            channel.close();
        }
    } catch {
        // 같은 탭 CustomEvent는 이미 전달됐으므로 저장소 차단은 읽음 자체를 막지 않는다.
    }
}

export async function markFreeBoardPostRead(postId: number | string, userId: string | null, commentIds?: string[]) {
    const normalizedId = String(postId);
    if (userId) {
        const response = await fetch('/api/board/free/read', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: normalizedId, ...(commentIds ? { commentIds } : {}) }),
        });
        if (!response.ok) throw new Error(`자유게시판 읽음 저장 실패 (${response.status})`);
    } else {
        saveGuestReadId(normalizedId);
        if (commentIds) {
            localStorage.setItem(GUEST_COMMENT_READ_STORAGE_KEY, JSON.stringify(
                [...new Set([...getGuestReadCommentIds(), ...commentIds])].slice(-10000),
            ));
        }
    }
    emitFreeBoardRead(normalizedId, userId);
}

export function useMarkFreeBoardPostRead(
    postId: number | string | null | undefined,
    category: string | null | undefined,
    active = true,
    commentIds?: string[],
) {
    const { user, isAuthCheckComplete } = useAuth();
    const userId = user?.id || null;
    const commentKey = commentIds ? JSON.stringify([...commentIds].sort()) : undefined;
    useEffect(() => {
        if (!isAuthCheckComplete || !active || !postId || category !== 'free') return;
        let stopped = false;
        let saved = false;
        let pending = false;
        let attempts = 0;
        let retryTimer: number | null = null;
        const saveRead = async () => {
            if (stopped || saved || pending || document.visibilityState !== 'visible') return;
            pending = true;
            attempts += 1;
            try {
                await markFreeBoardPostRead(postId, userId, commentKey ? JSON.parse(commentKey) : undefined);
                saved = true;
            } catch (error) {
                console.warn('[FreeBoardRead] Failed to mark visible post read:', error);
                // One delayed retry, then retry only when the visible detail resumes.
                if (!stopped && attempts < 2) scheduleRetry();
            } finally {
                pending = false;
            }
        };
        const scheduleRetry = () => {
            if (stopped || saved || document.visibilityState !== 'visible') return;
            if (retryTimer !== null) window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => {
                retryTimer = null;
                void saveRead();
            }, 800);
        };
        void saveRead();
        window.addEventListener('focus', scheduleRetry);
        window.addEventListener('online', scheduleRetry);
        document.addEventListener('visibilitychange', scheduleRetry);
        return () => {
            stopped = true;
            if (retryTimer !== null) window.clearTimeout(retryTimer);
            window.removeEventListener('focus', scheduleRetry);
            window.removeEventListener('online', scheduleRetry);
            document.removeEventListener('visibilitychange', scheduleRetry);
        };
    }, [active, category, commentKey, isAuthCheckComplete, postId, userId]);
}

export function useFreeBoardUnreadState() {
    const { user, isAuthCheckComplete } = useAuth();
    const userId = user?.id || null;
    const [unreadPostIds, setUnreadPostIds] = useState<Set<string>>(new Set());
    const [unreadCommentCounts, setUnreadCommentCounts] = useState<Record<string, number>>({});
    const requestVersion = useRef(0);

    const loadUnread = useCallback(async () => {
        if (!isAuthCheckComplete) return;
        const version = ++requestVersion.current;
        try {
            if (userId) {
                const response = await fetch('/api/board/free/unread', {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) {
                    if (response.status === 401 && version === requestVersion.current) {
                        setUnreadPostIds(new Set());
                        setUnreadCommentCounts({});
                    }
                    return;
                }
                const payload = await response.json();
                if (version === requestVersion.current) {
                    setUnreadPostIds(new Set((payload.unreadPostIds || []).map(String)));
                    setUnreadCommentCounts(payload.unreadCommentCounts || {});
                }
                return;
            }

            const fourteenDaysAgo = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
            const { data, error } = await cafe24
                .from('board_posts')
                .select('id, category, user_id, created_at, is_hidden')
                .eq('category', 'free')
                .eq('is_hidden', false);
            if (error || version !== requestVersion.current) return;
            const { data: comments, error: commentError } = data?.length ? await cafe24
                .from('board_comments').select('id, post_id, user_id, created_at, is_hidden')
                .in('post_id', data.map((post: { id: string | number }) => post.id))
                .gte('created_at', fourteenDaysAgo) : { data: [], error: null };
            if (commentError || version !== requestVersion.current) return;
            const readIds = getGuestReadIds();
            const activity = getFreeBoardUnreadActivity(data || [], comments || [], readIds, getGuestReadCommentIds());
            setUnreadPostIds(new Set(activity.unreadPostIds));
            setUnreadCommentCounts(activity.unreadCommentCounts);
        } catch (error) {
            // 모바일 화면 복귀 직후의 일시적 fetch 실패는 기존 배지 상태를 유지한다.
            console.warn('[FreeBoardRead] Failed to refresh unread state:', error);
        }
    }, [isAuthCheckComplete, userId]);

    useEffect(() => {
        setUnreadPostIds(new Set());
        setUnreadCommentCounts({});
        void loadUnread();
        return () => { requestVersion.current += 1; };
    }, [loadUnread]);

    useEffect(() => {
        const handleRead = (event: Event) => {
            const detail = (event as CustomEvent)?.detail;
            const postId = String(detail?.postId || '');
            if (!postId) return;
            // Older tabs lack viewer identity: re-query rather than apply their read state.
            if (detail.userId === undefined) {
                void loadUnread();
                return;
            }
            if (detail.userId !== userId) return;
            requestVersion.current += 1;
            setUnreadPostIds((current) => {
                const next = new Set(current);
                next.delete(postId);
                return next;
            });
            void loadUnread();
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
    }, [loadUnread, userId]);

    const commentCount = Object.values(unreadCommentCounts).reduce((sum, count) => sum + count, 0);
    return { count: unreadPostIds.size + commentCount, unreadPostIds, unreadCommentCounts };
}

export function useFreeBoardUnreadCount() {
    return useFreeBoardUnreadState().count;
}
