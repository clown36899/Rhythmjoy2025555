import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDeletedData() {
    console.log('=== 삭제된 데이터 복구 가능 여부 확인 ===\n');

    console.log('⚠️  Supabase는 기본적으로 삭제된 데이터를 복구할 수 없습니다.');
    console.log('하드 삭제(DELETE)는 영구적이며, 백업이 없으면 복구 불가능합니다.\n');

    console.log('📋 복구 가능한 경우:');
    console.log('1. Supabase 대시보드에서 자동 백업이 활성화된 경우');
    console.log('2. Point-in-Time Recovery (PITR)가 활성화된 경우 (유료 플랜)');
    console.log('3. 수동 백업을 만들어둔 경우\n');

    console.log('🔍 확인 방법:');
    console.log('1. Supabase 대시보드 → Settings → Database → Backups');
    console.log('2. 백업이 있다면 특정 시점으로 복원 가능\n');

    console.log('💡 대안:');
    console.log('1. 브라우저 캐시/로컬스토리지에 데이터가 남아있을 수 있음');
    console.log('2. 네트워크 탭에서 이전 응답 데이터 확인');
    console.log('3. 삭제 전 스크린샷이나 복사한 내용이 있는지 확인\n');

    // 최근 생성된 게시물 확인 (삭제 직전 데이터 추정)
    console.log('📊 최근 생성된 게시물 (참고용):');

    const { data: recentPosts } = await supabase
        .from('board_posts')
        .select('id, title, created_at, category')
        .order('created_at', { ascending: false })
        .limit(10);

    recentPosts?.forEach((post, i) => {
        console.log(`${i + 1}. #${post.id} - ${post.title?.substring(0, 40)} (${new Date(post.created_at).toLocaleString()})`);
    });

    console.log('\n=== 확인 완료 ===');
    console.log('\n❓ 어떤 글을 삭제하셨나요? ID나 제목을 알려주시면 더 자세히 확인해드릴 수 있습니다.');
}

checkDeletedData();
