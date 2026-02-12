
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyRPC() {
    console.log('🧪 [RPC 검증] 2026년 1월 데이터 집계 테스트 시작...');

    const startStr = '2026-01-01T00:00:00+09:00';
    const endStr = '2026-01-31T23:59:59+09:00';

    // 1. RPC 호출
    console.log('\n📡 [1] RPC 호출 결과 (get_monthly_webzine_stats)...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_monthly_webzine_stats', {
        start_date: startStr,
        end_date: endStr
    });

    if (rpcError) {
        console.error('❌ RPC 에러:', rpcError.message, rpcError.code);
    } else {
        console.log('✅ RPC 데이터 수신 성공!');
        console.log('📊 Meta 정보:', rpcData.meta);
        console.log('📈 상위 컨텐츠 (Top 3):', rpcData.topContents?.slice(0, 3));
    }

    // 2. 직접 쿼리와 비교
    console.log('\n🔍 [2] site_analytics_logs 직접 쿼리 카운트 (Jan 2026)...');
    const { count: totalLogs, error: lErr } = await supabase
        .from('site_analytics_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-01-31');

    const { count: userLogs, error: uErr } = await supabase
        .from('site_analytics_logs')
        .select('*', { count: 'exact', head: true })
        .eq('is_admin', false)
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-01-31');

    console.log('전체 로우 (Jan 2026):', totalLogs);
    console.log('일반 유저 로우 (is_admin=false):', userLogs);

    if (rpcData && rpcData.meta) {
        const diff = totalLogs - rpcData.meta.totalLogs;
        console.log(`\n⚖️ [비교 결과] DB 전체(${totalLogs}) vs RPC 집계(${rpcData.meta.totalLogs})`);
        console.log(`차이: ${diff} 건`);
        if (diff === 0) {
            console.log('🎉 데이터가 완벽하게 일치합니다!');
        } else {
            console.log('⚠️ 데이터 차이가 발생했습니다. RPC 내부 필터링 확인이 필요합니다.');
        }
    }
}

verifyRPC();
