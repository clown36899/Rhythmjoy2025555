import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DB_PATH = './src/data/scraped_events.db';

// Naver Cafe ID to Domain Mapping Table
const CAFE_ID_MAP = {
    '14933600': 'swingscandal',
    // Future additions here
};

async function fixLinks() {
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    console.log('🔍 Scanning for Naver Cafe links needing domain repair...');
    // Find all naver cafe links - both old internal ones and potentially mis-mapped ones
    const events = await db.all('SELECT id, source_url FROM scraped_events WHERE source_url LIKE "%cafe.naver.com/%"');

    if (events.length === 0) {
        console.log('✅ No Naver Cafe links found.');
        await db.close();
        return;
    }

    console.log(`🛠️ Processing ${events.length} Naver Cafe links...`);

    let repairedCount = 0;
    for (const event of events) {
        let articleId = null;
        let cafeId = null;
        let domain = 'swingfamily'; // default fallback for now

        // Extract ID and Article from internal mobile link (f-e/cafes/ID/articles/No)
        const internalMatch = event.source_url.match(/\/cafes\/(\d+)\/articles\/(\d+)/);
        if (internalMatch) {
            cafeId = internalMatch[1];
            articleId = internalMatch[2];
        } else {
            // Extract Article from already partially fixed links (domain/No)
            const articleMatch = event.source_url.match(/.com\/([^/]+)\/(\d+)/);
            if (articleMatch) {
                // If it's already a domain link, check if it was mis-mapped
                articleId = articleMatch[2];
                // We don't have the cafeId here, but for ss_260404_sat we know it needs fix
                if (event.id.startsWith('ss_')) {
                    cafeId = '14933600';
                }
            }
        }

        if (articleId && cafeId && CAFE_ID_MAP[cafeId]) {
            domain = CAFE_ID_MAP[cafeId];
            const fixedUrl = `https://cafe.naver.com/${domain}/${articleId}`;
            
            if (event.source_url !== fixedUrl) {
                await db.run('UPDATE scraped_events SET source_url = ?, updated_at = ? WHERE id = ?', [
                    fixedUrl,
                    new Date().toISOString(),
                    event.id
                ]);
                console.log(`✨ Fixed [${event.id}]: ${fixedUrl}`);
                repairedCount++;
            }
        }
    }

    console.log(`🎉 Link recovery complete. Repaired ${repairedCount} items.`);
    await db.close();
}

fixLinks().catch(console.error);
