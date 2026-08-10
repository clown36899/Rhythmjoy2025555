import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getPushSubscription: vi.fn(),
    getPushPreferences: vi.fn(),
    verifySubscriptionOwnership: vi.fn(),
    canonicalPreferences: {
        enabled: true,
        pref_today_digest: true,
        pref_new_event_alerts: true,
        pref_events: true,
        pref_class: true,
        pref_clubs: true,
        pref_new_event_social: true,
        pref_new_event_class: true,
        pref_new_event_clubs: true,
        pref_filter_tags: null,
        pref_filter_class_genres: null,
        pref_digest_time: '08:30',
        pref_digest_days: [0, 1, 2, 3, 4, 5, 6],
        pref_digest_timezone: 'Asia/Seoul',
        pref_only_with_events: true,
    },
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'admin-user' } }),
}));

vi.mock('../lib/pwaDetect', () => ({
    isPWAMode: () => true,
    getMobilePlatform: () => 'android',
}));

vi.mock('../lib/pushNotifications', () => ({
    getPushSubscription: mocks.getPushSubscription,
    getPushPreferences: mocks.getPushPreferences,
    verifySubscriptionOwnership: mocks.verifySubscriptionOwnership,
    subscribeToPush: vi.fn(),
    saveSubscriptionToDataStore: vi.fn(),
    unsubscribeFromPush: vi.fn(),
    getNotificationPermission: () => 'granted',
    requestNotificationPermission: vi.fn().mockResolvedValue('granted'),
    getPushSupportStatus: () => ({ supported: true, reason: 'supported' }),
    DEFAULT_PUSH_PREFERENCES: { ...mocks.canonicalPreferences, enabled: false, pref_new_event_alerts: false },
    PUSH_DIGEST_TIME_OPTIONS: ['08:00', '08:30', '09:00'],
}));

import NotificationSettingsModal from './NotificationSettingsModal';

describe('NotificationSettingsModal account and device state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPushSubscription.mockResolvedValue(null);
        mocks.getPushPreferences.mockResolvedValue(mocks.canonicalPreferences);
    });

    it('shows the saved account settings as enabled while offering to reconnect this browser', async () => {
        render(<NotificationSettingsModal isOpen onClose={() => {}} />);

        await waitFor(() => {
            expect(screen.getByText(/계정 알림 설정은 켜져 있지만 이 브라우저 연결이 만료됐습니다/)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /이 기기 연결 및 저장/ })).toBeEnabled();
        expect(screen.getByText('월 화 수 목 금 토 일 08:30')).toBeInTheDocument();
        expect(screen.getByText('3/3 대상')).toBeInTheDocument();
        expect(mocks.verifySubscriptionOwnership).not.toHaveBeenCalled();
    });
});
