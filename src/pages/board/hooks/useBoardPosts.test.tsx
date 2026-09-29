import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBoardPosts } from './useBoardPosts';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../lib/cafe24Client', () => ({ cafe24: {
    from: () => { const query = { select: () => query, eq: () => query, order: () => query, range: mocks.query }; return query; },
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
} }));
beforeEach(() => {
    vi.useFakeTimers(); mocks.query.mockReset();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const props = { category: 'free' as const, postsPerPage: 10, isAdminChecked: true, isRealAdmin: true };
it('refreshes displayed comment totals on resume and ignores an older list response', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.query.mockReturnValueOnce(new Promise(r => { resolveOld = r; })).mockResolvedValue({ data: [{ id: 'post-1', comment_count: 3 }], count: 1 });
    const { result, unmount } = renderHook(() => useBoardPosts(props));
    act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(result.current.posts[0].comment_count).toBe(3);
    await act(async () => resolveOld({ data: [{ id: 'post-1', comment_count: 0 }], count: 1 }));
    expect(result.current.posts[0].comment_count).toBe(3);
    act(() => window.dispatchEvent(new Event('focus')));
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(mocks.query).toHaveBeenCalledTimes(2);
});
