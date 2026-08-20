import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as AppEvent } from '../lib/cafe24Client';
import {
    BENEFIT_EVENTS_SEEN_STORAGE_KEY,
    useBenefitEventsUnreadState,
} from './useBenefitEventsUnreadCount';

const mocks = vi.hoisted(() => {
    const channel = {
        on: vi.fn(),
        subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);

    return {
        auth: { user: { id: 'benefit-user' } as { id: string } | null },
        channel,
        fetchActiveOneDayBenefitEvents: vi.fn(),
        removeChannel: vi.fn(),
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => mocks.auth,
}));

vi.mock('../lib/cafe24Client', () => ({
    cafe24: {
        channel: vi.fn(() => mocks.channel),
        removeChannel: mocks.removeChannel,
    },
}));

vi.mock('../lib/benefitEventsData', () => ({
    fetchActiveOneDayBenefitEvents: mocks.fetchActiveOneDayBenefitEvents,
}));

const event = (overrides: Partial<AppEvent>): AppEvent => ({
    id: 'benefit-a',
    title: '무료 행사',
    date: '2099-08-21',
    time: '',
    location: '서울',
    category: 'event',
    price: '',
    image: '',
    organizer: '주최자',
    benefit_eligible: true,
    benefit_kind: 'free_event',
    ...overrides,
});

describe('useBenefitEventsUnreadState', () => {
    beforeEach(() => {
        window.localStorage.clear();
        mocks.auth.user = { id: 'benefit-user' };
        mocks.fetchActiveOneDayBenefitEvents.mockReset().mockResolvedValue([]);
        mocks.removeChannel.mockClear();
    });

    it('counts only current unseen benefits, clears them on entry, and counts later additions', async () => {
        const current = event({ id: 'benefit-current' });
        const past = event({ id: 'benefit-past', date: '2000-01-01' });
        const ordinary = event({ id: 'ordinary', benefit_eligible: false, benefit_kind: null });
        const { result, rerender } = renderHook(
            ({ events }) => useBenefitEventsUnreadState(events),
            { initialProps: { events: [current, past, ordinary] } },
        );

        await waitFor(() => expect(result.current.count).toBe(1));
        expect(result.current.unreadEventIds).toEqual(['benefit-current']);

        act(() => result.current.markAllSeen());
        expect(result.current.count).toBe(0);
        const stored = JSON.parse(window.localStorage.getItem(BENEFIT_EVENTS_SEEN_STORAGE_KEY) || '{}');
        expect(stored['user:benefit-user']).toContain('benefit-current');

        rerender({ events: [current, event({ id: 'benefit-later' })] });
        await waitFor(() => expect(result.current.unreadEventIds).toEqual(['benefit-later']));
    });

    it('includes active one-day benefit links in the unread count', async () => {
        mocks.fetchActiveOneDayBenefitEvents.mockResolvedValue([
            event({ id: 'oneday-new', date: undefined }),
        ]);

        const { result } = renderHook(() => useBenefitEventsUnreadState([]));

        await waitFor(() => expect(result.current.unreadEventIds).toEqual(['oneday-new']));
    });
});
