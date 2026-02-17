import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';

// netlify dev 환경에서 프로젝트 루트 기준 경로
const PROJECT_ROOT = path.resolve(process.cwd());
const JSON_PATH = path.join(PROJECT_ROOT, 'src/data/scraped_events.json');
const SCRAPED_DIR = path.join(PROJECT_ROOT, 'public/scraped');

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
    structured_data?: {
        date: string;
        day?: string;
        title: string;
        status: string;
        djs?: string[];
        times?: string[];
        location?: string;
        fee?: string;
        note?: string;
    };
    created_at?: string;
    updated_at?: string;
}

function readEvents(): ScrapedEvent[] {
    try {
        const raw = fs.readFileSync(JSON_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function writeEvents(events: ScrapedEvent[]): void {
    fs.writeFileSync(JSON_PATH, JSON.stringify(events, null, 2), 'utf-8');
}

function deleteImageFile(posterUrl: string | null | undefined): boolean {
    if (!posterUrl) return false;
    // posterUrl 형식: "/scraped/filename.png"
    const filename = path.basename(posterUrl);
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
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        // ===== GET: 전체 목록 조회 =====
        if (event.httpMethod === 'GET') {
            const events = readEvents();
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(events),
            };
        }

        // ===== POST: 이벤트 추가/수정 (upsert by id) =====
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const incoming: ScrapedEvent[] = Array.isArray(body) ? body : [body];

            if (incoming.length === 0 || !incoming[0].id) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'id 필드가 필요합니다.' }),
                };
            }

            const events = readEvents();
            const now = new Date().toISOString();

            for (const item of incoming) {
                const idx = events.findIndex(e => e.id === item.id);
                const record = {
                    ...item,
                    updated_at: now,
                    created_at: item.created_at || now,
                };
                if (idx >= 0) {
                    events[idx] = record; // 수정
                } else {
                    events.push(record); // 추가
                }
            }

            writeEvents(events);

            return {
                statusCode: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, count: incoming.length }),
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

            const events = readEvents();
            const deletedImages: string[] = [];

            // 삭제 대상의 이미지 파일도 함께 삭제
            for (const id of idsToDelete) {
                const target = events.find(e => e.id === id);
                if (target?.poster_url) {
                    if (deleteImageFile(target.poster_url)) {
                        deletedImages.push(target.poster_url);
                    }
                }
            }

            const remaining = events.filter(e => !idsToDelete.includes(e.id));
            writeEvents(remaining);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    deleted: events.length - remaining.length,
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
    }
};
