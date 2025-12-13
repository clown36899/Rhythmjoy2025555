import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const handler: Handler = async (event, context) => {
    // Netlify 환경변수 자동 로드
    const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        // 1. DB에서 image_thumbnail이 있는 모든 이벤트 가져오기
        const { data: events, error: fetchError } = await supabase
            .from('events')
            .select('id, image_thumbnail')
            .not('image_thumbnail', 'is', null);

        if (fetchError) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `이벤트 조회 실패: ${fetchError.message}` }),
            };
        }

        if (!events || events.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: '처리할 이벤트가 없습니다.' }),
            };
        }

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const event of events) {
            const thumbnailUrl = event.image_thumbnail;

            // 썸네일 URL에서 파일 경로 추출
            const match = thumbnailUrl.match(/\/storage\/v1\/object\/public\/images\/(.+?)(\?|$)/);
            if (!match) {
                errors.push(`이벤트 ${event.id}: URL 파싱 실패`);
                errorCount++;
                continue;
            }

            const thumbnailPath = decodeURIComponent(match[1]);

            // thumbnail/ 폴더가 아니면 스킵
            if (!thumbnailPath.startsWith('event-posters/thumbnail/')) {
                skipCount++;
                continue;
            }

            // 파일명 추출
            const fileName = thumbnailPath.split('/').pop();
            if (!fileName) {
                errors.push(`이벤트 ${event.id}: 파일명 추출 실패`);
                errorCount++;
                continue;
            }

            const microPath = `event-posters/micro/${fileName}`;

            try {
                // 2. 썸네일 이미지 다운로드
                const { data: thumbnailBlob, error: downloadError } = await supabase.storage
                    .from('images')
                    .download(thumbnailPath);

                if (downloadError) {
                    errors.push(`이벤트 ${event.id}: 다운로드 실패 - ${downloadError.message}`);
                    errorCount++;
                    continue;
                }

                // 3. 이미지를 그대로 micro 폴더에 복사 (리사이즈는 클라이언트에서)
                // Netlify Functions에서는 Sharp 사용 불가능하므로 원본 복사
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(microPath, thumbnailBlob, {
                        contentType: 'image/webp',
                        cacheControl: '31536000',
                        upsert: true,
                    });

                if (uploadError) {
                    errors.push(`이벤트 ${event.id}: 업로드 실패 - ${uploadError.message}`);
                    errorCount++;
                    continue;
                }

                // 4. DB에 image_micro URL 저장
                const { data: publicUrlData } = supabase.storage
                    .from('images')
                    .getPublicUrl(microPath);

                const { error: updateError } = await supabase
                    .from('events')
                    .update({ image_micro: publicUrlData.publicUrl })
                    .eq('id', event.id);

                if (updateError) {
                    errors.push(`이벤트 ${event.id}: DB 업데이트 실패 - ${updateError.message}`);
                    errorCount++;
                    continue;
                }

                successCount++;

            } catch (err) {
                errors.push(`이벤트 ${event.id}: 처리 중 오류 - ${err}`);
                errorCount++;
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: '마이그레이션 완료',
                total: events.length,
                success: successCount,
                skip: skipCount,
                error: errorCount,
                errors: errors.slice(0, 10), // 처음 10개 에러만 표시
            }),
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `마이그레이션 실패: ${error}` }),
        };
    }
};

export { handler };
