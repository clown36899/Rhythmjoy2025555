
const { createClient } = require('@supabase/supabase-js');

// 유효함이 확인된 URL과 SERVICE_KEY
const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

// Admin 권한으로 생성
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function verifySchema() {
    console.log('=== session_logs 스키마 타입 검증 (Service Key 사용) ===');

    const testSessionId = 'schema_verify_' + Date.now();

    // 1. Boolean 값(false)으로 Insert 시도
    const { data, error } = await supabaseAdmin
        .from('session_logs')
        .insert({
            session_id: testSessionId,
            is_admin: false, // Core verification point
            entry_page: '/schema_verify',
            user_id: null // UUID 컬럼인지 확인 (텍스트로 들어가도 UUID 포맷 아니면 에러날수도 있지만, 일단 null로)
        })
        .select()
        .single();

    if (error) {
        console.error('❌ Insert 실패:', error.message);
        if (error.message.includes('type integer')) {
            console.error('🚨 진단 결과: DB의 is_admin 컬럼이 아직 INTEGER 타입입니다. (SQL 미적용)');
            process.exit(1);
        } else {
            console.error('⚠️ 다른 에러 발생:', error);
        }
    } else {
        console.log('✅ Insert 성공!');
        console.log('   -> 저장된 데이터:', data);
        console.log(`   -> is_admin 값: ${data.is_admin} (Type: ${typeof data.is_admin})`);

        if (typeof data.is_admin === 'boolean') {
            console.log('🎉 최종 진단: DB 스키마가 BOOLEAN으로 올바르게 변경되었습니다.');
        } else {
            console.log('❓ 타입이 예상과 다릅니다.');
        }

        // 청소
        await supabaseAdmin.from('session_logs').delete().eq('session_id', testSessionId);
    }
}

verifySchema();
