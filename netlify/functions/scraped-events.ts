import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';

// netlify dev 환경에서 프로젝트 루트 기준 경로
const PROJECT_ROOT = path.resolve(process.cwd());
const SCRAPED_DIR = path.join(PROJECT_ROOT, 'public/scraped');

function getJsonPath(type: string | undefined): string {
    const filename = type === 'lessons' ? 'scraped_lessons.json' : 'scraped_events.json';
    return path.join(PROJECT_ROOT, 'src/data/', filename);
}

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
    is_collected?: boolean;
}

function readEvents(jsonPath: string): ScrapedEvent[] {
    try {
        if (!fs.existsSync(jsonPath)) return [];
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function writeEvents(jsonPath: string, events: ScrapedEvent[]): void {
    fs.writeFileSync(jsonPath, JSON.stringify(events, null, 2), 'utf-8');
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

    const type = event.queryStringParameters?.type; // 'social' | 'lessons'
    const jsonPath = getJsonPath(type);

    try {
        // ===== GET: 전체 목록 조회 =====
        if (event.httpMethod === 'GET') {
            const events = readEvents(jsonPath);
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(events),
            };
        }

        // ===== POST: 이벤트 추가/수정 (upsert by id) =====
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

            const events = readEvents(jsonPath);
            const now = new Date().toISOString();

            for (const item of incoming) {
                let posterUrl = item.poster_url;

                // Base64 이미지가 포함된 경우 파일로 저장
                if (item.imageData && item.imageData.startsWith('data:image')) {
                    try {
                        const base64Data = item.imageData.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(base64Data, 'base64');
                        const ext = item.imageData.split(';')[0].split('/')[1] || 'png';
                        // 고유 파일명 생성 (기존 포스터가 있으면 덮어쓰거나 새 이름 생성 가능, 여기선 새 이름 권장)
                        const timestamp = Date.now();
                        const filename = `edited_${item.id}_${timestamp}.${ext}`;
                        const filePath = path.join(SCRAPED_DIR, filename);

                        // 기존 이미지가 있다면 삭제 시도 (옵션)
                        if (item.poster_url) deleteImageFile(item.poster_url);

                        fs.writeFileSync(filePath, buffer);
                        posterUrl = `/scraped/${filename}`;
                        console.log(`이미지 저장 완료: ${posterUrl}`);
                    } catch (err) {
                        console.error('이미지 저장 중 오류:', err);
                    }
                }

                const idx = events.findIndex(e => e.id === item.id);
                const record = {
                    ...item,
                    poster_url: posterUrl,
                    updated_at: now,
                    created_at: item.created_at || now,
                };
                // imageData는 JSON에 저장하지 않음
                delete (record as any).imageData;

                if (idx >= 0) {
                    events[idx] = record; // 수정
                } else {
                    events.push(record); // 추가
                }
            }

            writeEvents(jsonPath, events);

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

            const events = readEvents(jsonPath);
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
            writeEvents(jsonPath, remaining);

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
