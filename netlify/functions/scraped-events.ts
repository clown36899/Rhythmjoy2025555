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
        // ===== GET: 전체 목록 조회 (페이지네이션) =====
        if (event.httpMethod === 'GET') {
            const page = parseInt(event.queryStringParameters?.page || '1', 10);
            const tab = event.queryStringParameters?.tab; // 'new' | 'collected' | undefined
            const limit = 30;
            const offset = (page - 1) * limit;

            let query = supabase
                .from('scraped_events')
                .select('*', { count: 'exact' })
                .or('status.is.null,status.neq.excluded');

            if (tab === 'new') query = query.eq('is_collected', false);
            else if (tab === 'collected') query = query.eq('is_collected', true);

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data || [], total: count || 0, page, limit }),
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
                // 중복 체크 (신규 수집 시에만) — 중복이면 upsert 자체를 건너뜀
                if (!item.is_collected) {
                    const sd = item.structured_data || {};
                    const date = sd.date || '';
                    const eventType = (sd.event_type || '').trim();
                    const djs: string[] = sd.djs || [];
                    const title = (sd.title || '').trim();

                    let existing: any = null;
                    let skipReason = '';

                    // 1순위: source_url + 날짜 중복 체크 (타이틀이 달라도 같은 포스트+날짜면 동일 이벤트)
                    if (date && item.source_url) {
                        const { data } = await supabase
                            .from('scraped_events')
                            .select('id')
                            .eq('source_url', item.source_url)
                            .eq('structured_data->>date', date)
                            .neq('id', item.id)
                            .maybeSingle();
                        if (data) { existing = data; skipReason = '동일 소스URL+날짜 중복'; }
                    }

                    // 2순위: 소셜 — 날짜 + DJ 이름 중복 체크
                    if (!existing && eventType === '소셜' && date && djs.length > 0) {
                        for (const dj of djs) {
                            const { data } = await supabase
                                .from('scraped_events')
                                .select('id')
                                .eq('structured_data->>date', date)
                                .contains('structured_data->djs', JSON.stringify([dj]))
                                .neq('id', item.id)
                                .maybeSingle();
                            if (data) { existing = data; skipReason = '날짜+DJ 중복'; break; }
                        }
                    }

                    // 3순위: 날짜 + 제목 중복 체크 (ilike로 부분 매칭)
                    if (!existing && date && title) {
                        const { data } = await supabase
                            .from('scraped_events')
                            .select('id')
                            .eq('structured_data->>date', date)
                            .eq('structured_data->>title', title)
                            .neq('id', item.id)
                            .maybeSingle();
                        if (data) { existing = data; skipReason = '날짜+제목 중복'; }
                    }

                    if (existing) {
                        skipped.push({ id: item.id, reason: skipReason, existingId: existing.id });
                        console.log(`[scraped-events] SKIP duplicate: ${item.id} → existing=${existing.id} (${skipReason})`);
                        continue; // ← 중복이면 upsert 건너뜀
                    }

                    // 같은 ID로 이미 존재하는 경우 is_collected 보존
                    const { data: sameId } = await supabase
                        .from('scraped_events')
                        .select('id, is_collected')
                        .eq('id', item.id)
                        .maybeSingle();
                    if (sameId?.is_collected) {
                        skipped.push({ id: item.id, reason: '이미 완료 처리됨', existingId: sameId.id });
                        console.log(`[scraped-events] SKIP already collected: ${item.id}`);
                        continue; // ← 완료 처리된 항목 덮어쓰기 방지
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
