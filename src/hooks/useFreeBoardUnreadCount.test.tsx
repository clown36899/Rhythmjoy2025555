import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFreeBoardUnreadState } from './useFreeBoardUnreadCount';

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'resume-test-user' } }),
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
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(),
        },
    };
});

describe('useFreeBoardUnreadState resume recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
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
