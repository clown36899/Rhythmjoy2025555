import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkExistingData() {
    console.log('=== 기존 클릭 데이터 확인 ===\n');

    // 1. site_analytics_logs에서 이벤트 클릭 데이터 확인
    console.log('[1] site_analytics_logs에서 이벤트 클릭 데이터 확인...');

    const { data: eventClicks, error } = await supabase
        .from('site_analytics_logs')
        .select('target_id, target_type, user_id, fingerprint, created_at')
        .eq('target_type', 'event')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('❌ 에러:', error.message);
        return;
    }

    console.log(`   총 이벤트 클릭 샘플 (최근 10건):`);
    eventClicks?.forEach((click, i) => {
        const userInfo = click.user_id ? `User ${click.user_id.substring(0, 8)}` : `FP ${click.fingerprint?.substring(0, 12)}`;
        console.log(`   ${i + 1}. Event #${click.target_id} - ${userInfo} - ${new Date(click.created_at).toLocaleString()}`);
    });

    // 2. 이벤트별 클릭 수 집계
    console.log('\n[2] 이벤트별 클릭 수 집계...');

    const { data: clickCounts } = await supabase.rpc('get_event_click_counts') as any;

    // RPC가 없으면 직접 쿼리
    if (!clickCounts) {
        console.log('   (RPC 없음, 수동 집계 필요)');

        // 전체 이벤트 클릭 수 확인
        const { count } = await supabase
            .from('site_analytics_logs')
            .select('*', { count: 'exact', head: true })
            .eq('target_type', 'event');

        console.log(`   전체 이벤트 클릭 기록: ${count}건`);
    }

    // 3. 중복 제거 후 유니크 조회수 계산 (user_id + target_id 또는 fingerprint + target_id)
    console.log('\n[3] 중복 제거 후 유니크 조회수 계산...');
    console.log('   (SQL로 직접 실행 필요)');
    console.log(`
  -- 이벤트별 유니크 조회수 계산 쿼리
  SELECT 
    target_id::bigint as event_id,
    COUNT(DISTINCT 
      CASE 
        WHEN user_id IS NOT NULL THEN user_id::text
        ELSE fingerprint
      END
    ) as unique_views
  FROM site_analytics_logs
  WHERE target_type = 'event'
    AND target_id ~ '^[0-9]+$'  -- 숫자만 (social- 제외)
  GROUP BY target_id
  ORDER BY unique_views DESC
  LIMIT 10;
  `);

    console.log('\n=== 확인 완료 ===');
}

checkExistingData();
