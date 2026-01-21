import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBoardStats() {
    console.log('=== 게시판 클릭 통계 확인 ===\n');

    // 1. site_analytics_logs의 모든 target_type 확인
    console.log('[1] site_analytics_logs의 모든 target_type 확인...');

    const { data: allLogs } = await supabase
        .from('site_analytics_logs')
        .select('target_type')
        .limit(2000);

    const uniqueTypes = [...new Set(allLogs?.map(t => t.target_type))];
    console.log('   발견된 target_type:', uniqueTypes);

    // 2. 각 타입별 개수
    console.log('\n[2] 타입별 클릭 수...');
    for (const type of uniqueTypes) {
        const { count } = await supabase
            .from('site_analytics_logs')
            .select('*', { count: 'exact', head: true })
            .eq('target_type', type);

        console.log(`   ${type}: ${count}건`);
    }

    // 3. 게시판 관련 타입 찾기 (board, post, article 등)
    console.log('\n[3] 게시판 관련 데이터 샘플...');

    const boardTypes = uniqueTypes.filter(t =>
        t.toLowerCase().includes('board') ||
        t.toLowerCase().includes('post') ||
        t.toLowerCase().includes('article')
    );

    if (boardTypes.length > 0) {
        console.log(`   게시판 관련 타입: ${boardTypes.join(', ')}`);

        for (const type of boardTypes) {
            const { data: samples } = await supabase
                .from('site_analytics_logs')
                .select('target_id, target_title, created_at')
                .eq('target_type', type)
                .limit(5);

            console.log(`\n   [${type}] 샘플 데이터:`);
            samples?.forEach((s, i) => {
                console.log(`   ${i + 1}. ID: ${s.target_id}, 제목: ${s.target_title?.substring(0, 30)}...`);
            });
        }
    } else {
        console.log('   게시판 관련 타입 없음');
    }

    // 4. section 필드에서 게시판 관련 데이터 찾기
    console.log('\n[4] section 필드에서 게시판 관련 데이터 확인...');

    const { data: sections } = await supabase
        .from('site_analytics_logs')
        .select('section')
        .limit(2000);

    const uniqueSections = [...new Set(sections?.map(s => s.section))];
    const boardSections = uniqueSections.filter(s =>
        s?.toLowerCase().includes('board') ||
        s?.toLowerCase().includes('post')
    );

    if (boardSections.length > 0) {
        console.log(`   게시판 관련 section: ${boardSections.join(', ')}`);
    } else {
        console.log('   게시판 관련 section 없음');
    }

    // 5. board_posts 테이블의 현재 views 확인
    console.log('\n[5] board_posts 테이블의 현재 views 확인...');

    const { data: posts, count: totalPosts } = await supabase
        .from('board_posts')
        .select('id, title, views', { count: 'exact' })
        .order('views', { ascending: false })
        .limit(10);

    console.log(`   총 게시물 수: ${totalPosts}건`);
    console.log('   조회수 TOP 10:');
    posts?.forEach((p, i) => {
        console.log(`   ${i + 1}. #${p.id} - ${p.title?.substring(0, 30)}... (조회: ${p.views || 0})`);
    });

    console.log('\n=== 확인 완료 ===');
}

checkBoardStats();
