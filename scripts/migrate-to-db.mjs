import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';

const JSON_PATH = './src/data/scraped_events.json';
const DB_PATH = './src/data/scraped_events.db';

async function migrate() {
    console.log('🏁 Starting Migration: JSON -> SQLite');

    // 1. JSON 데이터 읽기
    let jsonData = [];
    try {
        const content = await fs.readFile(JSON_PATH, 'utf8');
        jsonData = JSON.parse(content);
        console.log(`✅ Loaded ${jsonData.length} events from JSON.`);
    } catch (err) {
        console.warn('⚠️ No existing JSON found or error reading JSON. Starting with empty data.');
    }

    // 2. SQLite DB 연결 및 테이블 생성
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS scraped_events (
            id TEXT PRIMARY KEY,
            keyword TEXT,
            source_url TEXT,
            poster_url TEXT,
            extracted_text TEXT,
            structured_data JSONB,
            is_collected BOOLEAN DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT (datetime('now')),
            updated_at TIMESTAMPTZ DEFAULT (datetime('now'))
        );
    `);
    console.log('✅ SQLite Table "scraped_events" initialized.');

    // 3. 데이터 주입
    let count = 0;
    const stmt = await db.prepare(`
        INSERT OR REPLACE INTO scraped_events (
            id, keyword, source_url, poster_url, extracted_text, structured_data, is_collected, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of jsonData) {
        await stmt.run(
            event.id,
            event.keyword,
            event.source_url,
            event.poster_url,
            event.extracted_text,
            JSON.stringify(event.structured_data || {}),
            event.is_collected ? 1 : 0,
            event.created_at || new Date().toISOString()
        );
        count++;
    }

    await stmt.finalize();
    console.log(`🎉 Migration Completed! ${count} rows inserted into DB.`);
    await db.close();
}

migrate().catch(console.error);
