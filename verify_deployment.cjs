
const { createClient } = require('@supabase/supabase-js');

// 환경변수 (사용자 환경 로그에서 추출)
const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.q68jIM48vD1-w1B8h1T5wZ9g4X9Jt5rR9X5s_4V9g5s'; // 실제 키값은 로그에서 확인된 값 사용
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function verify() {
    console.log('=== 1. DB 스키마 & 타입 검증 (session_logs.is_admin) ===');
    // 테스트 데이터 삽입 시도 (boolean 값 전송)
    const testSessionId = 'verify_' + Date.now();

    // Guest(Anon) 권한으로 Insert 시도
    const { error: insertError } = await supabaseAnon
        .from('session_logs')
        .insert({
            session_id: testSessionId,
            is_admin: false, // Boolean 전송
            entry_page: '/verify_test'
        });

    if (insertError) {
        console.error('❌ [Guest] Insert Failed:', insertError.message);
        if (insertError.message.includes('type integer')) {
            console.error('   -> 원인: DB 컬럼이 여전히 INTEGER입니다. (SQL 미적용 의심)');
        } else if (insertError.message.includes('row-level security')) {
            console.error('   -> 원인: RLS 정책이 막혔습니다. (Guest 권한 누락)');
        }
    } else {
        console.log('✅ [Guest] Insert 성공 (RLS 통과)');

        // 삽입된 데이터 타입을 확인하기 위해 Admin 권한으로 조회
        const { data: fetchLogs } = await supabaseAdmin
            .from('session_logs')
            .select('is_admin')
            .eq('session_id', testSessionId)
            .single();

        if (fetchLogs) {
            console.log(`   -> 저장된 값: ${fetchLogs.is_admin} (Type: ${typeof fetchLogs.is_admin})`);
            if (typeof fetchLogs.is_admin === 'boolean') {
                console.log('✅ [Schema] is_admin 컬럼이 BOOLEAN 타입입니다.');
            } else {
                console.error('❌ [Schema] is_admin 컬럼이 BOOLEAN이 아닙니다. (현재타입: ' + typeof fetchLogs.is_admin + ')');
            }
        }

        // 테스트 데이터 청소
        await supabaseAdmin.from('session_logs').delete().eq('session_id', testSessionId);
    }

    console.log('\n=== 2. 관리자 권한 함수 검증 (get_user_admin_status) ===');
    // 이 함수는 현재 세션의 이메일을 기반으로 작동함.
    // Anon 클라이언트로 호출하면 이메일이 없으므로 false가 나와야 정상.

    const { data: rpcResultAnon, error: rpcErrorAnon } = await supabaseAnon.rpc('get_user_admin_status');
    console.log(`[Anon Call] Result: ${rpcResultAnon}, Error: ${rpcErrorAnon?.message || 'None'}`);

    if (rpcResultAnon === false) {
        console.log('✅ [Logic] 비로그인 상태에서 관리자 권한 없음 확인됨.');
    }

    // 로그인 시뮬레이션은 JWT 생성이 필요하여 이 스크립트에서는 어려움.
    // 대신 billboard_users 테이블 내용을 확인하여 참조 대상이 올바른지 확인.
    const { data: billboardUsers } = await supabaseAdmin
        .from('billboard_users')
        .select('email, is_active')
        .eq('is_active', true);

    console.log(`   -> 참조 타겟(billboard_users) 활성 유저 수: ${billboardUsers?.length || 0}`);
    if (billboardUsers) {
        billboardUsers.forEach(u => console.log(`      - ${u.email}`));
    }
}

verify().catch(console.error);
