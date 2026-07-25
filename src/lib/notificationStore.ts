import { openDB } from 'idb';

const DB_NAME = 'notification-history';
const STORE_NAME = 'notifications';
const DB_VERSION = 1;

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
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    })
    : null;

const getDB = async () => {
    if (!dbPromise) return null;
    return dbPromise;
};

async function getServerUnread(): Promise<NotificationRecord[]> {
    if (typeof window === 'undefined') return [];
    const response = await fetch('/api/notifications', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    if (response.status === 401) return [];
    if (!response.ok) throw new Error(`알림함 조회 실패 (${response.status})`);
    const payload = await response.json();
    return Array.isArray(payload?.notifications) ? payload.notifications : [];
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
        let server: NotificationRecord[] = [];
        try {
            server = await getServerUnread();
        } catch (error) {
            console.warn('[NotificationStore] 서버 알림함 조회 실패:', error);
        }
        const serverCommentIds = new Set(server.map(item => item.data?.commentId).filter(Boolean));
        const dedupedLocal = local.filter(item => !item.data?.commentId || !serverCommentIds.has(item.data.commentId));
        return [...server, ...dedupedLocal].sort((a, b) =>
            new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
        );
    },

    async markAsRead(id: string) {
        if (id.startsWith('server:')) {
            await markServerRead(id);
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
