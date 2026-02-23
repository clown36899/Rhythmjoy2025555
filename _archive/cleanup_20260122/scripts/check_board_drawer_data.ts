import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBoardDrawerData() {
    console.log('=== side_drawer_board 데이터 상세 확인 ===\n');

    // 1. side_drawer_board 데이터 확인
    console.log('[1] side_drawer_board 클릭 데이터...');

    const { data: boardClicks, count } = await supabase
        .from('site_analytics_logs')
        .select('target_id, target_type, target_title, created_at', { count: 'exact' })
        .eq('section', 'side_drawer_board')
        .order('created_at', { ascending: false })
        .limit(20);

    console.log(`   총 ${count}건의 클릭 기록`);
    console.log('\n   최근 20건:');
    boardClicks?.forEach((c, i) => {
        console.log(`   ${i + 1}. [${c.target_type}] ID:${c.target_id} - ${c.target_title?.substring(0, 40)}`);
    });

    // 2. target_type별 분류
    console.log('\n[2] target_type별 분류...');

    const types = [...new Set(boardClicks?.map(c => c.target_type))];
    for (const type of types) {
        const { count: typeCount } = await supabase
            .from('site_analytics_logs')
            .select('*', { count: 'exact', head: true })
            .eq('section', 'side_drawer_board')
            .eq('target_type', type);

        console.log(`   ${type}: ${typeCount}건`);
    }

    // 3. 게시물별 클릭 수 집계
    console.log('\n[3] 게시물별 클릭 수 집계 (유니크 사용자)...');

    const { data: rawData } = await supabase
        .from('site_analytics_logs')
        .select('target_id, user_id, fingerprint')
        .eq('section', 'side_drawer_board');

    // 게시물별로 그룹화하여 유니크 사용자 계산
    const postClicks = new Map();

    rawData?.forEach(click => {
        const postId = click.target_id;
        if (!postClicks.has(postId)) {
            postClicks.set(postId, new Set());
        }

        const userKey = click.user_id || click.fingerprint;
        if (userKey) {
            postClicks.get(postId).add(userKey);
        }
    });

    // 정렬 및 출력
    const sorted = Array.from(postClicks.entries())
        .map(([postId, users]) => ({ postId, uniqueViews: users.size }))
        .sort((a, b) => b.uniqueViews - a.uniqueViews)
        .slice(0, 20);

    console.log('   게시물별 유니크 조회수 TOP 20:');
    sorted.forEach((item, i) => {
        console.log(`   ${i + 1}. Post #${item.postId}: ${item.uniqueViews}명`);
    });

    console.log('\n=== 확인 완료 ===');
    console.log(`\n💡 발견: side_drawer_board에 ${count}건의 게시판 클릭 데이터 존재!`);
}

checkBoardDrawerData();
