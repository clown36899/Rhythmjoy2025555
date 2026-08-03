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

// 상태 변경 공지는 사용자별 서버 읽음 상태로 관리한다. 정적 로컬 공지를
// 함께 두면 새 서버 공지와 중복되어 종 숫자가 실제 미읽음 수보다 커진다.
const SITE_NOTIFICATIONS: SiteNotificationItem[] = [];

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
