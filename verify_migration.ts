import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyMigration() {
    console.log('=== 범용 조회수 추적 시스템 마이그레이션 검증 ===\n');

    // 1. item_views 테이블 존재 확인
    console.log('[1] item_views 테이블 확인...');
    const { data: itemViews, error: tableError } = await supabase
        .from('item_views')
        .select('*')
        .limit(5);

    if (tableError) {
        console.error('❌ item_views 테이블 없음:', tableError.message);
        return;
    }
    console.log(`✅ item_views 테이블 존재 (샘플 ${itemViews?.length || 0}건)`);

    // 2. 데이터 마이그레이션 확인
    console.log('\n[2] 데이터 마이그레이션 확인...');

    const { count: oldCount } = await supabase
        .from('board_post_views')
        .select('*', { count: 'exact', head: true });

    const { count: newCount } = await supabase
        .from('item_views')
        .select('*', { count: 'exact', head: true })
        .eq('item_type', 'board_post');

    console.log(`   board_post_views: ${oldCount}건`);
    console.log(`   item_views (board_post): ${newCount}건`);

    if (oldCount === newCount) {
        console.log('   ✅ 데이터 마이그레이션 성공!');
    } else {
        console.log(`   ⚠️ 데이터 불일치 (차이: ${Math.abs((oldCount || 0) - (newCount || 0))}건)`);
    }

    // 3. 새 RPC 함수 테스트
    console.log('\n[3] increment_item_views RPC 함수 테스트...');

    const testUserId = randomUUID();
    const testPostId = 76;

    // 현재 조회수 확인
    const { data: before } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Post ${testPostId} 현재 조회수: ${before?.views || 0}`);

    // RPC 호출
    const { data: wasIncremented, error: rpcError } = await supabase.rpc('increment_item_views', {
        p_item_id: testPostId,
        p_item_type: 'board_post',
        p_user_id: testUserId,
        p_fingerprint: null
    });

    if (rpcError) {
        console.error('   ❌ RPC 에러:', rpcError.message);
        return;
    }

    console.log(`   RPC 결과: ${wasIncremented ? '✅ TRUE (증가됨)' : '❌ FALSE (증가 안됨)'}`);

    // 조회수 증가 확인
    const { data: after } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Post ${testPostId} 새 조회수: ${after?.views || 0}`);
    console.log(`   차이: +${(after?.views || 0) - (before?.views || 0)}`);

    // 4. item_views에 기록 확인
    const { data: viewRecord } = await supabase
        .from('item_views')
        .select('*')
        .eq('user_id', testUserId)
        .eq('item_type', 'board_post')
        .eq('item_id', testPostId)
        .single();

    if (viewRecord) {
        console.log('   ✅ item_views에 기록됨');
    } else {
        console.log('   ❌ item_views에 기록 없음');
    }

    // 5. 중복 방지 테스트
    console.log('\n[4] 중복 방지 테스트...');
    const { data: result2 } = await supabase.rpc('increment_item_views', {
        p_item_id: testPostId,
        p_item_type: 'board_post',
        p_user_id: testUserId,
        p_fingerprint: null
    });

    console.log(`   두 번째 호출 결과: ${result2 ? '❌ TRUE (중복 방지 실패!)' : '✅ FALSE (중복 방지 성공!)'}`);

    const { data: after2 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   조회수: ${after2?.views} (변화 없어야 함)`);

    // 6. 샘플 데이터 확인
    console.log('\n[5] item_views 샘플 데이터...');
    const { data: samples } = await supabase
        .from('item_views')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    samples?.forEach((s, i) => {
        const userInfo = s.user_id ? `User ${s.user_id.substring(0, 8)}` : `FP ${s.fingerprint?.substring(0, 12)}`;
        console.log(`   ${i + 1}. ${s.item_type} #${s.item_id} - ${userInfo} - ${new Date(s.created_at).toLocaleString()}`);
    });

    console.log('\n=== ✅ 검증 완료 ===');
}

verifyMigration();
