import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPrefixes() {
    console.log('=== 게시판 Prefix 확인 ===\n');

    const { data: prefixes, error } = await supabase
        .from('board_prefixes')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('❌ 에러:', error.message);
        return;
    }

    console.log('모든 Prefix:');
    prefixes?.forEach((p, i) => {
        console.log(`${i + 1}. ID: ${p.id}, name: "${p.name}", category_code: ${p.category_code || 'N/A'}`);
    });

    const noticePrefix = prefixes?.find(p => p.name === '공지' || p.name.includes('공지'));
    if (noticePrefix) {
        console.log(`\n✅ 공지 Prefix ID: ${noticePrefix.id}`);
    } else {
        console.log('\n⚠️  공지 Prefix를 찾을 수 없습니다.');
    }

    console.log('\n=== 확인 완료 ===');
}

checkPrefixes();
