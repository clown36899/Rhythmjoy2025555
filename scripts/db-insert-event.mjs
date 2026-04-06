import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = './src/data/scraped_events.db';

// Naver Cafe ID to Domain Mapping Table
const CAFE_ID_MAP = {
    '14933600': 'swingscandal',
    // Future additions here: 'CAF_ID': 'DOMAIN'
};

function normalizeUrl(url) {
    if (!url) return url;
    
    // 1. Handle Naver Cafe mobile internal links (f-e/cafes/ID/articles/No)
    const mobileMatch = url.match(/\/cafes\/(\d+)\/articles\/(\d+)/);
    if (mobileMatch) {
        const cafeId = mobileMatch[1];
        const articleId = mobileMatch[2];
        const domain = CAFE_ID_MAP[cafeId] || 'swingfamily'; // fallback
        return `https://cafe.naver.com/${domain}/${articleId}`;
    }
    
    // 2. Handle Naver Cafe partially-fixed or domain-based links needing update
    const domainMatch = url.match(/cafe.naver.com\/([^/]+)\/(\d+)/);
    if (domainMatch) {
        const currentDomain = domainMatch[1];
        const articleId = domainMatch[2];
        
        // If we find an ID swap rule, we could apply it here if needed, 
        // but for ingestion, we usually receive mobile links first.
        return url; 
    }
    
    return url;
}

async function insertEvent(eventData) {
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    const source_url = normalizeUrl(eventData.source_url || '');
    const id = eventData.id || `scraped_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Image Fallback: If no official poster_url, use the screenshot from public/scraped/
    const poster_url = eventData.poster_url || `/scraped/${id}.png`;

    await db.run(`
        INSERT INTO scraped_events (
            id, keyword, source_url, poster_url, extracted_text, structured_data, is_collected, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            keyword=excluded.keyword,
            source_url=excluded.source_url,
            poster_url=excluded.poster_url,
            extracted_text=excluded.extracted_text,
            structured_data=excluded.structured_data,
            updated_at=excluded.updated_at
    `, [
        id,
        eventData.keyword || '',
        source_url || eventData.source_url,
        poster_url,
        eventData.extracted_text || '',
        JSON.stringify(eventData.structured_data || {}),
        0, // is_collected: false
        now,
        eventData.created_at || now
    ]);

    console.log(`✅ Event [${id}] successfully saved to SQLite DB.`);
    await db.close();
}

// CLI 실행 처리
const args = process.argv.slice(2);
if (args.length > 0) {
    try {
        const data = JSON.parse(args[0]);
        insertEvent(data).catch(console.error);
    } catch (e) {
        console.error('❌ Invalid JSON input for insertion.');
    }
}

export { insertEvent };
