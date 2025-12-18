import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface EventPhotoDB extends DBSchema {
    photos: {
        key: string;
        value: {
            id: string;
            filename: string;
            blob: Blob;
            faceVector: number[];
            uploadedAt: number;
        };
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'rhythmjoy-photo-finder';
const STORE_NAME = 'photos';

export class LocalDB {
    private dbPromise: Promise<IDBPDatabase<EventPhotoDB>>;

    constructor() {
        this.dbPromise = openDB<EventPhotoDB>(DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by-date', 'uploadedAt');
                }
            },
        });
    }

    async addPhoto(file: File, faceVector: Float32Array): Promise<void> {
        const db = await this.dbPromise;
        await db.put(STORE_NAME, {
            id: crypto.randomUUID(),
            filename: file.name,
            blob: file,
            faceVector: Array.from(faceVector),
            uploadedAt: Date.now(),
        });
    }

    async getAllPhotos(): Promise<Array<{ id: string; blob: Blob; faceVector: number[]; filename: string }>> {
        const db = await this.dbPromise;
        return db.getAll(STORE_NAME);
    }

    async clear(): Promise<void> {
        const db = await this.dbPromise;
        await db.clear(STORE_NAME);
    }

    async deletePhoto(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete(STORE_NAME, id);
    }
}

export const localDB = new LocalDB();
