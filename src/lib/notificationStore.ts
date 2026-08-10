export const NOTIFICATION_INBOX_EVENT = 'swingenjoy:notification-inbox-changed';

const notifyInboxChanged = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIFICATION_INBOX_EVENT));
};

export interface NotificationRecord {
    id: string;
    title: string;
    body: string;
    url?: string;
    received_at: string;
    is_read: boolean;
    icon?: string;
    image?: string;
    data?: any;
}

// 운영 알림함의 원본은 서버 user_notifications 하나뿐이다.
// 이 메모리 저장소는 관리자 로컬 미리보기만 지원하며 새로고침 시 사라진다.
// 서비스워커나 앱이 같은 IndexedDB 스키마를 각자 소유하지 않도록 한다.
const volatilePreviewNotifications = new Map<string, NotificationRecord>();

async function getServerNotifications(unreadOnly: boolean): Promise<NotificationRecord[]> {
    if (typeof window === 'undefined') return [];
    const response = await fetch(`/api/notifications${unreadOnly ? '?unread=1' : ''}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
    });
    if (response.status === 401) return [];
    if (!response.ok) throw new Error(`알림함 조회 실패 (${response.status})`);
    const payload = await response.json();
    return Array.isArray(payload?.notifications) ? payload.notifications : [];
}

const notificationIdentity = (item: NotificationRecord) => (
    item.data?.commentId ? `comment:${item.data.commentId}`
        : item.data?.queueId ? `queue:${item.data.queueId}`
            : item.data?.kind === 'daily_schedule_morning' && item.data?.date
                ? `daily:${item.data.date}`
                : item.id
);

function mergeNotifications(server: NotificationRecord[], local: NotificationRecord[]) {
    const identities = new Set(server.map(notificationIdentity));
    return [...server, ...local.filter(item => !identities.has(notificationIdentity(item)))]
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
}

function getVolatileNotifications() {
    return [...volatilePreviewNotifications.values()];
}

async function markServerRead(id?: string) {
    if (typeof window === 'undefined') return;
    const response = await fetch('/api/notifications/read', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : {}),
    });
    if (response.status !== 401 && !response.ok) {
        throw new Error(`알림 읽음 처리 실패 (${response.status})`);
    }
}

async function markServerSourceRead(kind: string, sourceId: string) {
    if (typeof window === 'undefined' || !kind || !sourceId) return;
    const response = await fetch('/api/notifications/read', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, sourceId }),
    });
    if (response.status !== 401 && !response.ok) {
        throw new Error(`알림 읽음 처리 실패 (${response.status})`);
    }
}

export const notificationStore = {
    async getAll() {
        return getVolatileNotifications();
    },

    async upsertMany(records: NotificationRecord[]) {
        for (const record of records) {
            volatilePreviewNotifications.set(record.id, record);
        }
        notifyInboxChanged();
    },

    async getUnread() {
        const local = getVolatileNotifications().filter(item => !item.is_read);
        try {
            const server = await getServerNotifications(true);
            return mergeNotifications(server, local);
        } catch (error) {
            console.warn('[NotificationStore] 서버 알림함 조회 실패:', error);
            return local;
        }
    },

    async getRecent() {
        const local = getVolatileNotifications();
        try {
            const server = await getServerNotifications(false);
            return mergeNotifications(server, local).slice(0, 100);
        } catch (error) {
            console.warn('[NotificationStore] 서버 알림함 조회 실패:', error);
            return local.slice(0, 100);
        }
    },

    async markAsRead(id: string) {
        if (id.startsWith('server:')) {
            await markServerRead(id);
        } else {
            const notification = volatilePreviewNotifications.get(id);
            if (notification) {
                volatilePreviewNotifications.set(id, { ...notification, is_read: true });
            }
        }
        notifyInboxChanged();
    },

    async markSourceAsRead(kind: string, sourceId: string) {
        await markServerSourceRead(kind, sourceId);
        notifyInboxChanged();
    },

    async markAllAsRead() {
        await markServerRead();
        for (const [id, notification] of volatilePreviewNotifications.entries()) {
            if (!notification.is_read) {
                volatilePreviewNotifications.set(id, { ...notification, is_read: true });
            }
        }
        notifyInboxChanged();
    },

    async deleteOld() {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const [id, notification] of volatilePreviewNotifications.entries()) {
            if (new Date(notification.received_at).getTime() < sevenDaysAgo) {
                volatilePreviewNotifications.delete(id);
            }
        }
    },
};
