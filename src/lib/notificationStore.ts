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
    data?: any;
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    },
});

export const notificationStore = {
    async getAll() {
        const db = await dbPromise;
        return db.getAll(STORE_NAME);
    },

    async getUnread() {
        const db = await dbPromise;
        const all = await db.getAll(STORE_NAME);
        return all.filter(n => !n.is_read).sort((a, b) =>
            new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
        );
    },

    async markAsRead(id: string) {
        const db = await dbPromise;
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
        const db = await dbPromise;
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
        const db = await dbPromise;
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
