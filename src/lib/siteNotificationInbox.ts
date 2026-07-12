export type SiteNotificationAction = 'open-notification-settings';

export interface SiteNotificationItem {
    id: string;
    title: string;
    body: string;
    detail: string;
    received_at: string;
    icon: string;
    actionLabel?: string;
    action?: SiteNotificationAction;
}

const STORAGE_KEY = 'swingenjoy_site_notification_read_ids_v1';

export const SITE_NOTIFICATION_INBOX_EVENT = 'siteNotificationInboxChanged';

const SITE_NOTIFICATIONS: SiteNotificationItem[] = [
    {
        id: 'push-public-rollout-2026-07-11',
        title: '알림 구독이 전체 사용자에게 열렸습니다',
        body: '오늘 일정 알림과 새 일정 등록 알림을 받을 수 있습니다.',
        detail: '기존 구독자는 알림 설정에서 저장을 다시 누르면 현재 브라우저 구독과 새 설정이 갱신됩니다.',
        received_at: '2026-07-11T00:00:00+09:00',
        icon: 'ri-notification-badge-line',
        actionLabel: '알림 설정 / 구독 갱신',
        action: 'open-notification-settings',
    },
];

function readReadIds() {
    if (typeof window === 'undefined') return new Set<string>();

    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
        return new Set<string>();
    }
}

function writeIds(ids: Set<string>) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function getSiteNotifications() {
    return [...SITE_NOTIFICATIONS];
}

export function getUnreadSiteNotifications() {
    const readIds = readReadIds();
    return SITE_NOTIFICATIONS.filter((item) => !readIds.has(item.id));
}

export function markSiteNotificationsRead(ids = SITE_NOTIFICATIONS.map((item) => item.id)) {
    const readIds = readReadIds();
    ids.forEach((id) => readIds.add(id));
    writeIds(readIds);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SITE_NOTIFICATION_INBOX_EVENT));
    }
}
