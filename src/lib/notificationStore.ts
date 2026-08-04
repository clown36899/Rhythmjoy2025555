import { openDB } from 'idb';

const DB_NAME = 'notification-history';
const STORE_NAME = 'notifications';
const DB_VERSION = 2;
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

const canUseIndexedDB = typeof indexedDB !== 'undefined';

const dbPromise = canUseIndexedDB
    ? openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            } else if (oldVersion < 2) {
                // 새 서버 알림함 전환 전에 브라우저에만 남은 과거 미읽음 복제본을
                // 제거한다. 전환 공지는 서버가 사용자별로 정확히 한 건 생성한다.
                transaction.objectStore(STORE_NAME).clear();
            }
        },
    }).catch((error) => {
        // 구버전 탭과 새 탭이 동시에 살아 있는 동안 VersionError가 나더라도
        // 서버 알림함만 사용하면 기능을 계속 제공할 수 있다.
        console.warn('[NotificationStore] IndexedDB unavailable; using server-only fallback:', error);
        return null;
    })
    : null;

const getDB = async () => {
    if (!dbPromise) return null;
    return dbPromise;
};

async function getServerNotifications(unreadOnly: boolean): Promise<NotificationRecord[]> {
    if (typeof window === 'undefined') return [];
    const response = await fetch(`/api/notifications${unreadOnly ? '?unread=1' : ''}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
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
        const db = await getDB();
        if (!db) return [];
        return db.getAll(STORE_NAME);
    },

    async upsertMany(records: NotificationRecord[]) {
        const db = await getDB();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const record of records) {
            await store.put(record);
        }
        await tx.done;
    },

    async getUnread() {
        const db = await getDB();
        const local = db ? (await db.getAll(STORE_NAME)).filter(n => !n.is_read) : [];
        let serverHistory: NotificationRecord[] = [];
        try {
            // 서버의 사용자별 읽음 상태를 기준으로 삼아 다른 기기에서 읽은 로컬 복제본도 숨긴다.
            serverHistory = await getServerNotifications(false);
        } catch (error) {
            console.warn('[NotificationStore] 서버 알림함 조회 실패:', error);
            return local;
        }
        const serverIdentities = new Set(serverHistory.map(notificationIdentity));
        const unreadServer = serverHistory.filter(item => !item.is_read);
        const localOnly = local.filter(item => !serverIdentities.has(notificationIdentity(item)));
        return mergeNotifications(unreadServer, localOnly);
    },

    async getRecent() {
        const db = await getDB();
        const local = db ? await db.getAll(STORE_NAME) : [];
        let server: NotificationRecord[] = [];
        try {
            server = await getServerNotifications(false);
        } catch (error) {
            console.warn('[NotificationStore] 서버 알림함 조회 실패:', error);
        }
        return mergeNotifications(server, local).slice(0, 100);
    },

    async markAsRead(id: string) {
        if (id.startsWith('server:')) {
            await markServerRead(id);
            notifyInboxChanged();
            return;
        }
        const db = await getDB();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const notification = await store.get(id);
        if (notification) {
            notification.is_read = true;
            await store.put(notification);
        }
        await tx.done;
        notifyInboxChanged();
    },

    async markSourceAsRead(kind: string, sourceId: string) {
        await markServerSourceRead(kind, sourceId);
        notifyInboxChanged();
    },

    async markAllAsRead() {
        await markServerRead();
        const db = await getDB();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const notifications = await store.getAll();
        for (const n of notifications) {
            if (!n.is_read) {
                n.is_read = true;
                await store.put(n);
            }
        }
        await tx.done;
        notifyInboxChanged();
    },

    async deleteOld() {
        const db = await getDB();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const notifications = await store.getAll();
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        for (const n of notifications) {
            if (new Date(n.received_at) < sevenDaysAgo) {
                await store.delete(n.id);
            }
        }
        await tx.done;
    }
};
