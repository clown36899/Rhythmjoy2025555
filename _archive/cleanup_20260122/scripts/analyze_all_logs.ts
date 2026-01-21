import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeAllLogs() {
    console.log('=== site_analytics_logs 전체 분석 ===\n');

    // 1. 전체 데이터 샘플 확인
    console.log('[1] 전체 데이터 샘플 (최근 50건)...');

    const { data: samples } = await supabase
        .from('site_analytics_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    console.log(`   총 ${samples?.length}건 조회\n`);

    // 2. 모든 고유한 section 값 확인
    const uniqueSections = [...new Set(samples?.map(s => s.section))];
    console.log('[2] 발견된 모든 section:');
    uniqueSections.forEach(s => console.log(`   - ${s}`));

    // 3. 모든 고유한 target_type 값 확인
    const uniqueTypes = [...new Set(samples?.map(s => s.target_type))];
    console.log('\n[3] 발견된 모든 target_type:');
    uniqueTypes.forEach(t => console.log(`   - ${t}`));

    // 4. 숫자로 된 target_id 찾기 (게시물 ID일 가능성)
    console.log('\n[4] 숫자 target_id 샘플 (게시물일 가능성):');
    const numericIds = samples?.filter(s => /^\d+$/.test(s.target_id));

    if (numericIds && numericIds.length > 0) {
        console.log(`   발견: ${numericIds.length}건`);
        numericIds.slice(0, 10).forEach((item, i) => {
            console.log(`   ${i + 1}. [${item.target_type}] ID:${item.target_id} - ${item.target_title?.substring(0, 40)} (section: ${item.section})`);
        });
    } else {
        console.log('   없음');
    }

    // 5. category 필드 확인
    console.log('\n[5] category 필드 확인...');
    const uniqueCategories = [...new Set(samples?.map(s => s.category).filter(Boolean))];
    if (uniqueCategories.length > 0) {
        console.log('   발견된 category:', uniqueCategories);
    } else {
        console.log('   category 필드 없음');
    }

    // 6. 전체 통계
    console.log('\n[6] 전체 통계...');
    const { count: totalCount } = await supabase
        .from('site_analytics_logs')
        .select('*', { count: 'exact', head: true });

    console.log(`   총 레코드 수: ${totalCount}건`);

    // 7. 테이블 스키마 확인 (첫 번째 레코드의 모든 필드)
    console.log('\n[7] 테이블 스키마 (첫 번째 레코드):');
    if (samples && samples.length > 0) {
        console.log('   필드:', Object.keys(samples[0]).join(', '));
    }

    console.log('\n=== 분석 완료 ===');
}

analyzeAllLogs();
