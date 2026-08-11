import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getPushSubscription: vi.fn(),
    getPushPreferences: vi.fn(),
    verifySubscriptionOwnership: vi.fn(),
    subscribeToPush: vi.fn(),
    saveSubscriptionToDataStore: vi.fn(),
    unsubscribeFromPush: vi.fn(),
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
    subscribeToPush: mocks.subscribeToPush,
    saveSubscriptionToDataStore: mocks.saveSubscriptionToDataStore,
    unsubscribeFromPush: mocks.unsubscribeFromPush,
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
        mocks.unsubscribeFromPush.mockResolvedValue(true);
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

    it('shows an explicit retry state instead of false OFF settings when the account request fails', async () => {
        const user = userEvent.setup();
        mocks.getPushPreferences
            .mockRejectedValueOnce(new Error('설정 API 연결 실패'))
            .mockResolvedValueOnce(mocks.canonicalPreferences);

        render(<NotificationSettingsModal isOpen onClose={() => {}} />);

        expect(await screen.findByText('설정을 표시할 수 없음')).toBeInTheDocument();
        expect(screen.getByText('설정 API 연결 실패')).toBeInTheDocument();
        expect(screen.queryByText('오늘 일정 요약')).not.toBeInTheDocument();
        expect(screen.queryByText('새 등록 알림')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByText('오늘 일정 요약')).toBeInTheDocument();
        expect(screen.getByText('새 등록 알림')).toBeInTheDocument();
        expect(screen.getByText('월 화 수 목 금 토 일 08:30')).toBeInTheDocument();
    });

    it('keeps the modal open and reports a server error when disabling notifications fails', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        mocks.getPushSubscription.mockResolvedValue({ endpoint: 'https://push.example/device' });
        mocks.verifySubscriptionOwnership.mockResolvedValue(true);
        mocks.unsubscribeFromPush.mockResolvedValue(false);

        render(<NotificationSettingsModal isOpen onClose={onClose} />);
        await screen.findByText('오늘 일정 요약');

        await user.click(screen.getByRole('button', { name: /오늘 일정 요약/ }));
        await user.click(screen.getByRole('button', { name: /새 등록 알림/ }));
        await user.click(screen.getByRole('button', { name: '설정 저장' }));

        expect(await screen.findByText(/알림 해제를 서버에 저장하지 못했습니다/)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});
