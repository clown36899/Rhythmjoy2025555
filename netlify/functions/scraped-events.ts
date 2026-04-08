import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

// netlify dev 환경에서 프로젝트 루트 기준 경로
const PROJECT_ROOT = path.resolve(process.cwd());
const SCRAPED_DIR = path.join(PROJECT_ROOT, 'public/scraped');
const DB_PATH = path.join(PROJECT_ROOT, 'src/data/scraped_events.db');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

interface ScrapedEvent {
    id: string;
    keyword?: string;
    source_url: string;
    poster_url?: string | null;
    extracted_text: string;
    structured_data?: any;
    created_at?: string;
    updated_at?: string;
    is_collected?: boolean;
}

// DB 연결 헬퍼
async function getDb() {
    return open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
}

function deleteImageFile(posterUrl: string | null | undefined): boolean {
    if (!posterUrl) return false;
    let filename: string;
    if (posterUrl.startsWith('/scraped/')) {
        filename = path.basename(posterUrl);
    } else if (posterUrl.includes('scraped-image?file=')) {
        filename = posterUrl.split('scraped-image?file=')[1];
    } else {
        return false;
    }
    const filePath = path.join(SCRAPED_DIR, filename);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
    } catch (err) {
        console.error(`이미지 삭제 실패: ${filePath}`, err);
    }
    return false;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const db = await getDb();

    try {
        // ===== GET: 전체 목록 조회 =====
        if (event.httpMethod === 'GET') {
            const rows = await db.all("SELECT * FROM scraped_events WHERE status IS NULL OR status != 'excluded' ORDER BY created_at DESC");
            
            // SQLite 0/1 값을 Boolean으로, JSONB 데이터를 객체로 변환
            const events = rows.map(row => ({
                ...row,
                is_collected: !!row.is_collected,
                structured_data: JSON.parse(row.structured_data || '{}')
            }));

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(events),
            };
        }

        // ===== POST: 이벤트 추가/수정 (upsert) =====
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const incoming: (ScrapedEvent & { imageData?: string })[] = Array.isArray(body) ? body : [body];

            if (incoming.length === 0 || !incoming[0].id) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'id 필드가 필요합니다.' }),
                };
            }

            const now = new Date().toISOString();
            const skipped: { id: string; reason: string; existingId: string }[] = [];

            for (const item of incoming) {
                // 중복 체크: 같은 날짜 + 같은 제목이 이미 존재하면 스킵 (신규 수집 시에만)
                // is_collected 업데이트(등록 처리)는 id 기반 upsert이므로 그대로 진행
                if (!item.is_collected) {
                    const sd = item.structured_data || {};
                    const date = sd.date || '';
                    const title = (sd.title || '').trim();

                    if (date && title) {
                        const existing = await db.get(
                            `SELECT id FROM scraped_events
                             WHERE json_extract(structured_data, '$.date') = ?
                               AND TRIM(json_extract(structured_data, '$.title')) = ?
                               AND id != ?`,
                            [date, title, item.id]
                        );
                        if (existing) {
                            skipped.push({ id: item.id, reason: '날짜+제목 중복', existingId: existing.id });
                            console.log(`[scraped-events] SKIP duplicate: ${item.id} → existing=${existing.id} (${date} / ${title})`);
                            continue;
                        }
                    }
                }

                let posterUrl = item.poster_url;

                // Base64 이미지가 포함된 경우 파일로 저장
                console.log(`[scraped-events] item.id=${item.id} hasImageData=${!!item.imageData} imageDataStart=${item.imageData?.substring(0,30)}`);
                if (item.imageData && item.imageData.startsWith('data:image')) {
                    try {
                        const base64Data = item.imageData.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(base64Data, 'base64');
                        const ext = item.imageData.split(';')[0].split('/')[1] || 'png';
                        const timestamp = Date.now();
                        const filename = `edited_${item.id}_${timestamp}.${ext}`;
                        const filePath = path.join(SCRAPED_DIR, filename);
                        console.log(`[scraped-events] 파일 저장: ${filePath}`);

                        if (item.poster_url) deleteImageFile(item.poster_url);

                        fs.writeFileSync(filePath, buffer);
                        posterUrl = `/.netlify/functions/scraped-image?file=${filename}`;
                        console.log(`[scraped-events] 저장 완료 posterUrl=${posterUrl}`);
                    } catch (err) {
                        console.error('[scraped-events] 이미지 저장 중 오류:', err);
                    }
                } else {
                    console.log(`[scraped-events] imageData 없음 또는 형식 불일치`);
                }

                await db.run(`
                    INSERT INTO scraped_events (
                        id, keyword, source_url, poster_url, extracted_text, structured_data, is_collected, status, updated_at, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        keyword=excluded.keyword,
                        source_url=excluded.source_url,
                        poster_url=excluded.poster_url,
                        extracted_text=excluded.extracted_text,
                        structured_data=excluded.structured_data,
                        is_collected=excluded.is_collected,
                        status=excluded.status,
                        updated_at=excluded.updated_at
                `, [
                    item.id,
                    item.keyword,
                    item.source_url,
                    posterUrl,
                    item.extracted_text,
                    JSON.stringify(item.structured_data || {}),
                    item.is_collected ? 1 : 0,
                    item.status || null,
                    now,
                    item.created_at || now
                ]);
            }

            return {
                statusCode: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    count: incoming.length - skipped.length,
                    skipped,
                }),
            };
        }

        // ===== DELETE: 이벤트 삭제 + 이미지 파일 삭제 =====
        if (event.httpMethod === 'DELETE') {
            const body = JSON.parse(event.body || '{}');
            const idsToDelete: string[] = body.ids || (body.id ? [body.id] : []);

            if (idsToDelete.length === 0) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: '삭제할 id가 필요합니다.' }),
                };
            }

            // 이미지 파일 삭제를 위해 데이터 조회
            const placeholders = idsToDelete.map(() => '?').join(',');
            const targets = await db.all(`SELECT poster_url FROM scraped_events WHERE id IN (${placeholders})`, idsToDelete);
            
            const deletedImages: string[] = [];
            for (const target of targets) {
                if (target.poster_url && deleteImageFile(target.poster_url)) {
                    deletedImages.push(target.poster_url);
                }
            }

            // DB에서 삭제
            const result = await db.run(`DELETE FROM scraped_events WHERE id IN (${placeholders})`, idsToDelete);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    deleted: result.changes,
                    deletedImages,
                }),
            };
        }

        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    } catch (err: any) {
        console.error('scraped-events error:', err);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: err.message }),
        };
    } finally {
        await db.close();
    }
};
