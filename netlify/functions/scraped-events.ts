import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const STORAGE_BUCKET = 'scraped';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function getSupabase() {
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function storagePublicUrl(filename: string) {
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
}

async function deleteStorageFile(supabase: ReturnType<typeof getSupabase>, posterUrl: string | null | undefined): Promise<boolean> {
    if (!posterUrl) return false;

    let filename: string | null = null;

    if (posterUrl.includes(`/storage/v1/object/public/${STORAGE_BUCKET}/`)) {
        filename = posterUrl.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`)[1];
    } else if (posterUrl.includes('scraped-image?file=')) {
        // 레거시 로컬 경로는 삭제 불가 — 스킵
        return false;
    }

    if (!filename) return false;

    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([filename]);
    return !error;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const supabase = getSupabase();

    try {
        // ===== GET: 미수집 + 오늘 이후 데이터만 조회 =====
        if (event.httpMethod === 'GET') {
            const today = new Date().toISOString().slice(0, 10);
            const { data, error } = await supabase
                .from('scraped_events')
                .select('*')
                .or('status.is.null,status.neq.excluded')
                .eq('is_collected', false)
                .gte('structured_data->>date', today)
                .order('structured_data->>date', { ascending: true });

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(data || []),
            };
        }

        // ===== POST: 이벤트 추가/수정 (upsert) =====
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const incoming: any[] = Array.isArray(body) ? body : [body];

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
                // 중복 체크: 같은 날짜 + 같은 제목 (신규 수집 시에만)
                if (!item.is_collected) {
                    const sd = item.structured_data || {};
                    const date = sd.date || '';
                    const title = (sd.title || '').trim();

                    if (date && title) {
                        const { data: existing } = await supabase
                            .from('scraped_events')
                            .select('id')
                            .eq('structured_data->>date', date)
                            .eq('structured_data->>title', title)
                            .neq('id', item.id)
                            .maybeSingle();

                        if (existing) {
                            skipped.push({ id: item.id, reason: '날짜+제목 중복', existingId: existing.id });
                            console.log(`[scraped-events] SKIP duplicate: ${item.id} → existing=${existing.id}`);
                            continue;
                        }
                    }
                }

                let posterUrl = item.poster_url;

                // Base64 이미지 → Supabase Storage 업로드
                if (item.imageData && item.imageData.startsWith('data:image')) {
                    try {
                        const base64Data = item.imageData.replace(/^data:image\/\w+;base64,/, '');
                        const buffer = Buffer.from(base64Data, 'base64');
                        const ext = item.imageData.split(';')[0].split('/')[1] || 'png';
                        const filename = `edited_${item.id}_${Date.now()}.${ext}`;
                        const mimeType = `image/${ext}`;

                        // 기존 이미지 삭제 시도
                        await deleteStorageFile(supabase, item.poster_url);

                        const { error: uploadError } = await supabase.storage
                            .from(STORAGE_BUCKET)
                            .upload(filename, buffer, { contentType: mimeType, upsert: true });

                        if (!uploadError) {
                            posterUrl = storagePublicUrl(filename);
                        } else {
                            console.error('[scraped-events] Storage 업로드 실패:', uploadError);
                        }
                    } catch (err) {
                        console.error('[scraped-events] 이미지 처리 오류:', err);
                    }
                }

                const { error: upsertError } = await supabase
                    .from('scraped_events')
                    .upsert({
                        id: item.id,
                        keyword: item.keyword,
                        source_url: item.source_url,
                        poster_url: posterUrl,
                        extracted_text: item.extracted_text,
                        structured_data: item.structured_data || {},
                        is_collected: item.is_collected || false,
                        status: item.status || null,
                        updated_at: now,
                        created_at: item.created_at || now,
                    }, { onConflict: 'id' });

                if (upsertError) {
                    console.error(`[scraped-events] upsert 실패 id=${item.id}:`, upsertError);
                }
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

        // ===== DELETE: 이벤트 삭제 + Storage 이미지 삭제 =====
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

            // 이미지 삭제를 위해 poster_url 조회
            const { data: targets } = await supabase
                .from('scraped_events')
                .select('poster_url')
                .in('id', idsToDelete);

            const deletedImages: string[] = [];
            for (const target of targets || []) {
                if (target.poster_url) {
                    const deleted = await deleteStorageFile(supabase, target.poster_url);
                    if (deleted) deletedImages.push(target.poster_url);
                }
            }

            const { error, count } = await supabase
                .from('scraped_events')
                .delete({ count: 'exact' })
                .in('id', idsToDelete);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, deleted: count, deletedImages }),
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
