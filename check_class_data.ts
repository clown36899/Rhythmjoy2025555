import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkClassData() {
    console.log('=== 강습 클릭 데이터 확인 ===\n');

    // 1. target_type별 데이터 확인
    console.log('[1] site_analytics_logs의 모든 target_type 확인...');

    const { data: types } = await supabase
        .from('site_analytics_logs')
        .select('target_type')
        .limit(1000);

    const uniqueTypes = [...new Set(types?.map(t => t.target_type))];
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

    // 3. event 타입 중 category가 class인 것 확인
    console.log('\n[3] events 테이블에서 category=class 확인...');

    const { data: classEvents, count: classCount } = await supabase
        .from('events')
        .select('id, title, category', { count: 'exact' })
        .eq('category', 'class')
        .limit(5);

    console.log(`   강습(category=class) 이벤트: ${classCount}건`);
    classEvents?.forEach((e, i) => {
        console.log(`   ${i + 1}. Event #${e.id} - ${e.title}`);
    });

    // 4. 강습 이벤트의 클릭 데이터 확인
    if (classEvents && classEvents.length > 0) {
        console.log('\n[4] 강습 이벤트의 클릭 데이터 확인...');

        const classIds = classEvents.map(e => String(e.id));
        const { data: classClicks, count: clickCount } = await supabase
            .from('site_analytics_logs')
            .select('target_id, created_at', { count: 'exact' })
            .eq('target_type', 'event')
            .in('target_id', classIds)
            .limit(10);

        console.log(`   강습 이벤트 클릭 기록: ${clickCount}건`);
        classClicks?.forEach((c, i) => {
            console.log(`   ${i + 1}. Event #${c.target_id} - ${new Date(c.created_at).toLocaleString()}`);
        });
    }

    console.log('\n=== 확인 완료 ===');
}

checkClassData();
