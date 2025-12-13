import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import * as dotenv from 'dotenv';

// .env 파일 로드
dotenv.config();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase 환경변수가 설정되지 않았습니다.');
    console.error('VITE_PUBLIC_SUPABASE_URL:', supabaseUrl ? '설정됨' : '없음');
    console.error('VITE_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '설정됨' : '없음');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function migrateThumbnailsToMicro() {
    console.log('🚀 썸네일 → 마이크로 마이그레이션 시작...\n');

    try {
        // 1. DB에서 image_thumbnail이 있는 모든 이벤트 가져오기
        const { data: events, error: fetchError } = await supabase
            .from('events')
            .select('id, image_thumbnail')
            .not('image_thumbnail', 'is', null);

        if (fetchError) {
            throw new Error(`이벤트 조회 실패: ${fetchError.message}`);
        }

        if (!events || events.length === 0) {
            console.log('✅ 처리할 이벤트가 없습니다.');
            return;
        }

        console.log(`📊 총 ${events.length}개 이벤트 발견\n`);

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const event of events) {
            const thumbnailUrl = event.image_thumbnail;

            // 썸네일 URL에서 파일 경로 추출
            const match = thumbnailUrl.match(/\/storage\/v1\/object\/public\/images\/(.+?)(\?|$)/);
            if (!match) {
                console.log(`⚠️  이벤트 ${event.id}: URL 파싱 실패 - ${thumbnailUrl}`);
                errorCount++;
                continue;
            }

            const thumbnailPath = decodeURIComponent(match[1]);

            // thumbnail/ 폴더가 아니면 스킵
            if (!thumbnailPath.startsWith('event-posters/thumbnail/')) {
                console.log(`⏭️  이벤트 ${event.id}: 썸네일 폴더가 아님 - ${thumbnailPath}`);
                skipCount++;
                continue;
            }

            // 파일명 추출
            const fileName = thumbnailPath.split('/').pop();
            if (!fileName) {
                console.log(`⚠️  이벤트 ${event.id}: 파일명 추출 실패`);
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
                    console.log(`⚠️  이벤트 ${event.id}: 다운로드 실패 - ${downloadError.message}`);
                    errorCount++;
                    continue;
                }

                // 3. Sharp로 100px로 리사이즈 (WebP 변환)
                const buffer = await thumbnailBlob.arrayBuffer();
                const resizedBuffer = await sharp(Buffer.from(buffer))
                    .resize(100, 100, {
                        fit: 'cover',
                        position: 'center',
                    })
                    .webp({ quality: 85 })
                    .toBuffer();

                // 4. micro 폴더에 업로드
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(microPath, resizedBuffer, {
                        contentType: 'image/webp',
                        cacheControl: '31536000',
                        upsert: true, // 이미 존재하면 덮어쓰기
                    });

                if (uploadError) {
                    console.log(`⚠️  이벤트 ${event.id}: 업로드 실패 - ${uploadError.message}`);
                    errorCount++;
                    continue;
                }

                // 5. DB에 image_micro URL 저장
                const { data: publicUrlData } = supabase.storage
                    .from('images')
                    .getPublicUrl(microPath);

                const { error: updateError } = await supabase
                    .from('events')
                    .update({ image_micro: publicUrlData.publicUrl })
                    .eq('id', event.id);

                if (updateError) {
                    console.log(`⚠️  이벤트 ${event.id}: DB 업데이트 실패 - ${updateError.message}`);
                    errorCount++;
                    continue;
                }

                console.log(`✅ 이벤트 ${event.id}: ${fileName} → micro 폴더 복사 완료`);
                successCount++;

            } catch (err) {
                console.log(`⚠️  이벤트 ${event.id}: 처리 중 오류 - ${err}`);
                errorCount++;
            }
        }

        console.log('\n📊 마이그레이션 완료!');
        console.log(`✅ 성공: ${successCount}개`);
        console.log(`⏭️  스킵: ${skipCount}개`);
        console.log(`⚠️  실패: ${errorCount}개`);

    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error);
        process.exit(1);
    }
}

// 실행
migrateThumbnailsToMicro();
