import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyMigration() {
    console.log('\n=== 마이그레이션 검증 ===\n');

    // Method 1: Try to insert a test row to see required columns
    console.log('1. 테이블 구조 확인 (INSERT 테스트)...\n');

    // Test likes table
    const { data: likesTest, error: likesError } = await supabase
        .from('board_anonymous_comment_likes')
        .insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            comment_id: 999999
        })
        .select();

    if (likesError) {
        if (likesError.message.includes('user_id')) {
            console.log('✅ board_anonymous_comment_likes: user_id 컬럼 존재 확인!');
        } else if (likesError.message.includes('fingerprint')) {
            console.log('❌ board_anonymous_comment_likes: 아직 fingerprint 기반입니다!');
        } else {
            console.log('board_anonymous_comment_likes 에러:', likesError.message);
        }
    } else {
        console.log('✅ board_anonymous_comment_likes: user_id 기반으로 변경 완료!');
        console.log('테스트 데이터:', likesTest);

        // Clean up test data
        await supabase
            .from('board_anonymous_comment_likes')
            .delete()
            .eq('comment_id', 999999);
    }

    // Test dislikes table
    const { data: dislikesTest, error: dislikesError } = await supabase
        .from('board_anonymous_comment_dislikes')
        .insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            comment_id: 999999
        })
        .select();

    if (dislikesError) {
        if (dislikesError.message.includes('user_id')) {
            console.log('✅ board_anonymous_comment_dislikes: user_id 컬럼 존재 확인!');
        } else if (dislikesError.message.includes('fingerprint')) {
            console.log('❌ board_anonymous_comment_dislikes: 아직 fingerprint 기반입니다!');
        } else {
            console.log('board_anonymous_comment_dislikes 에러:', dislikesError.message);
        }
    } else {
        console.log('✅ board_anonymous_comment_dislikes: user_id 기반으로 변경 완료!');
        console.log('테스트 데이터:', dislikesTest);

        // Clean up test data
        await supabase
            .from('board_anonymous_comment_dislikes')
            .delete()
            .eq('comment_id', 999999);
    }

    console.log('\n2. RPC 함수 확인...\n');

    // Test RPC function
    const { data: rpcTest, error: rpcError } = await supabase
        .rpc('toggle_comment_interaction', {
            p_comment_id: '999999',
            p_type: 'like',
            p_is_anonymous: true,
            p_fingerprint: null
        });

    if (rpcError) {
        if (rpcError.message.includes('Authentication required')) {
            console.log('✅ RPC 함수: 로그인 필수 확인!');
        } else if (rpcError.message.includes('Fingerprint required')) {
            console.log('❌ RPC 함수: 아직 fingerprint 필요!');
        } else {
            console.log('RPC 에러:', rpcError.message);
        }
    } else {
        console.log('✅ RPC 함수: 정상 작동');
        console.log('RPC 결과:', rpcTest);
    }
}

verifyMigration()
    .then(() => {
        console.log('\n✅ 검증 완료\n');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ 검증 실패:', err);
        process.exit(1);
    });
