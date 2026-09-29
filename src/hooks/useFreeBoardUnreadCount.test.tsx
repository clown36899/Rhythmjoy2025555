import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_BOARD_READ_EVENT, useFreeBoardUnreadState, useMarkFreeBoardPostRead } from './useFreeBoardUnreadCount';

const mocks = vi.hoisted(() => ({
    auth: { user: { id: 'resume-test-user' } as { id: string } | null, isAuthCheckComplete: true },
    guestQuery: vi.fn(),
    commentQuery: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => mocks.auth,
}));

vi.mock('../lib/cafe24Client', () => {
    const channel = {
        on: vi.fn(),
        subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    return {
        cafe24: {
            from: (table: string) => ({ select: () => table === 'board_comments'
                ? { in: () => ({ gte: mocks.commentQuery }) }
                : { eq: () => ({ eq: mocks.guestQuery }) } }),
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(),
        },
    };
});

describe('useFreeBoardUnreadState resume recovery', () => {
    beforeEach(() => {
        mocks.auth = { user: { id: 'resume-test-user' }, isAuthCheckComplete: true };
        mocks.guestQuery.mockReset().mockResolvedValue({ data: [], error: null });
        mocks.commentQuery.mockReset().mockResolvedValue({ data: [], error: null });
        localStorage.clear();
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('waits for authentication before querying guest unread posts', async () => {
        mocks.auth = { user: null, isAuthCheckComplete: false };
        renderHook(() => useFreeBoardUnreadState());
        await act(async () => {});
        expect(mocks.guestQuery).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not let a late guest response overwrite the signed-in read state', async () => {
        let resolveGuest!: (value: unknown) => void;
        mocks.auth = { user: null, isAuthCheckComplete: true };
        mocks.guestQuery.mockReturnValue(new Promise(resolve => { resolveGuest = resolve; }));
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ unreadPostIds: [] }) } as Response);
        const { result, rerender } = renderHook(() => useFreeBoardUnreadState());
        mocks.auth.user = { id: 'resume-test-user' };
        rerender();
        await act(async () => {});
        await act(async () => { resolveGuest({ data: [{ id: 'already-read', category: 'free', created_at: new Date().toISOString() }], error: null }); });
        expect(result.current.count).toBe(0);
    });

    it('does not restore a read badge from a request started before the read succeeded', async () => {
        let resolveOld!: (value: unknown) => void;
        vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ unreadPostIds: [] }) } as Response);
        const { result } = renderHook(() => useFreeBoardUnreadState());
        act(() => {
            window.dispatchEvent(new CustomEvent(FREE_BOARD_READ_EVENT, {
                detail: { postId: 'already-read', userId: 'resume-test-user' },
            }));
        });
        await act(async () => {
            resolveOld({ ok: true, json: async () => ({ unreadPostIds: ['already-read'] }) });
        });
        expect(result.current.count).toBe(0);
    });

    it('ignores another account read broadcast', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ unreadPostIds: ['post-1'] }) } as Response);
        const { result } = renderHook(() => useFreeBoardUnreadState());
        await act(async () => {});
        act(() => window.dispatchEvent(new CustomEvent(FREE_BOARD_READ_EVENT, {
            detail: { postId: 'post-1', userId: 'other-account' },
        })));
        expect(result.current.count).toBe(1);
    });

    it('re-queries legacy tab messages instead of assuming which account read the post', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ unreadPostIds: ['post-1'] }) } as Response);
        const { result } = renderHook(() => useFreeBoardUnreadState());
        await act(async () => {});
        await act(async () => window.dispatchEvent(new StorageEvent('storage', {
            key: 'swingenjoy:free-board-read-sync:v1', newValue: JSON.stringify({ postId: 'post-1' }),
        })));
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(result.current.count).toBe(1);
    });

    it('waits for the signed-in identity before saving a visible detail', async () => {
        mocks.auth = { user: null, isAuthCheckComplete: false };
        vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
        const { rerender } = renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true));
        await act(async () => {});
        expect(fetch).not.toHaveBeenCalled();
        expect(localStorage.getItem('swingenjoy:free-board-read-posts:v1')).toBeNull();
        mocks.auth = { user: { id: 'reader-a' }, isAuthCheckComplete: true };
        rerender();
        await act(async () => {});
        expect(fetch).toHaveBeenCalledWith('/api/board/free/read', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ postId: 'post-1' }),
        }));
        expect(localStorage.getItem('swingenjoy:free-board-read-posts:v1')).toBeNull();
    });

    it('preserves guest reads locally and removes the matching guest badge', async () => {
        mocks.auth = { user: null, isAuthCheckComplete: true };
        mocks.guestQuery.mockResolvedValue({ data: [{ id: 'post-1', category: 'free', created_at: new Date().toISOString() }], error: null });
        const { result } = renderHook(() => useFreeBoardUnreadState());
        await act(async () => {});
        expect(result.current.count).toBe(1);
        renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true));
        await act(async () => {});
        expect(result.current.count).toBe(0);
        expect(JSON.parse(localStorage.getItem('swingenjoy:free-board-read-posts:v1')!)).toEqual(['post-1']);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('counts member comments separately and sends only the rendered comment IDs', async () => {
        vi.mocked(fetch).mockImplementation(async url => url === '/api/board/free/read'
            ? { ok: true } as Response
            : { ok: true, json: async () => ({ unreadPostIds: [], unreadCommentCounts: { 'post-1': 2 } }) } as Response);
        const { result } = renderHook(() => useFreeBoardUnreadState());
        await act(async () => {});
        expect(result.current.count).toBe(2);
        expect(result.current.unreadPostIds.size).toBe(0);
        renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true, ['c1']));
        await act(async () => {});
        expect(fetch).toHaveBeenCalledWith('/api/board/free/read', expect.objectContaining({
            body: JSON.stringify({ postId: 'post-1', commentIds: ['c1'] }),
        }));
        // The authoritative response can still report replies that arrived later.
        expect(result.current.unreadCommentCounts).toEqual({ 'post-1': 2 });
    });

    it('keeps unread guest replies after a body-only read and clears only displayed replies', async () => {
        mocks.auth = { user: null, isAuthCheckComplete: true };
        mocks.guestQuery.mockResolvedValue({ data: [{ id: 'post-1', category: 'free', created_at: '2020-01-01' }], error: null });
        mocks.commentQuery.mockResolvedValue({ data: ['c1', 'c2'].map(id => ({ id, post_id: 'post-1', created_at: new Date().toISOString() })), error: null });
        const { result } = renderHook(() => useFreeBoardUnreadState());
        renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true));
        await act(async () => {});
        expect(result.current.unreadCommentCounts).toEqual({ 'post-1': 2 });
        renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true, ['c1']));
        await act(async () => {});
        expect(result.current.unreadCommentCounts).toEqual({ 'post-1': 1 });
    });

    it('does not convert a failed member read into a guest read or erase its badge', async () => {
        vi.mocked(fetch).mockImplementation(async (url) => url === '/api/board/free/read'
            ? { ok: false, status: 401 } as Response
            : { ok: true, json: async () => ({ unreadPostIds: ['post-1'] }) } as Response);
        const { result } = renderHook(() => useFreeBoardUnreadState());
        renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true));
        await act(async () => { await vi.advanceTimersByTimeAsync(800); });
        expect(result.current.count).toBe(1);
        expect(localStorage.getItem('swingenjoy:free-board-read-posts:v1')).toBeNull();
    });

    it('cancels read retries when the detail closes and never marks another category', async () => {
        const { rerender } = renderHook(({ active, category }) => useMarkFreeBoardPostRead('post-1', category, active), {
            initialProps: { active: true, category: 'free' },
        });
        await act(async () => {});
        rerender({ active: false, category: 'free' });
        await act(async () => { await vi.advanceTimersByTimeAsync(800); });
        rerender({ active: true, category: 'history' });
        await act(async () => {});
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps the last confirmed badge on a temporary refresh failure', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ unreadPostIds: ['post-1'] }) } as Response);
        const { result } = renderHook(() => useFreeBoardUnreadState());
        await act(async () => {});
        act(() => window.dispatchEvent(new Event('focus')));
        await act(async () => { await vi.advanceTimersByTimeAsync(800); });
        expect(result.current.count).toBe(1);
    });

    it('retries a failed read save on network recovery while the detail stays open', async () => {
        const readEvent = vi.fn();
        window.addEventListener(FREE_BOARD_READ_EVENT, readEvent);
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({ ok: true } as Response);
        renderHook(() => useMarkFreeBoardPostRead('post-1', 'free', true));
        await act(async () => {});
        expect(readEvent).not.toHaveBeenCalled();
        act(() => window.dispatchEvent(new Event('online')));
        await act(async () => { await vi.advanceTimersByTimeAsync(800); });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(readEvent).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('swingenjoy:free-board-read-posts:v1')).toBeNull();
        window.removeEventListener(FREE_BOARD_READ_EVENT, readEvent);
    });

    it('keeps the hook alive when the resume refresh fetch is temporarily unavailable', async () => {
        const unhandledRejection = vi.fn();
        window.addEventListener('unhandledrejection', unhandledRejection);
        const { result, unmount } = renderHook(() => useFreeBoardUnreadState());

        await act(async () => {
            await Promise.resolve();
        });
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(result.current.count).toBe(0);
        expect(unhandledRejection).not.toHaveBeenCalled();

        unmount();
        window.removeEventListener('unhandledrejection', unhandledRejection);
    });
});
