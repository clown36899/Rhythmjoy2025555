// RPC 함수 업데이트 검증 스크립트
// 사용자별 평균 체류 시간이 올바르게 반환되는지 확인

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// .env 파일 수동 파싱
const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim();
    }
});

const supabaseUrl = envVars['VITE_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envVars['SUPABASE_SERVICE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경 변수를 찾을 수 없습니다.');
    console.error('VITE_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? '✓' : '✗');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function verifyRPCUpdate() {
    console.log('🔍 RPC 함수 업데이트 검증 시작...\n');

    try {
        // 오늘 날짜 범위로 RPC 호출
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

        console.log(`📅 날짜 범위: ${startDate} ~ ${endDate}\n`);

        const { data, error } = await supabase.rpc('get_analytics_summary_v2', {
            start_date: startDate,
            end_date: endDate
        });

        if (error) {
            console.error('❌ RPC 호출 실패:', error);
            return;
        }

        console.log('✅ RPC 호출 성공!\n');
        console.log('📊 전체 통계:');
        console.log(`  - 총 방문: ${data.total_visits}`);
        console.log(`  - 로그인 방문: ${data.logged_in_visits}`);
        console.log(`  - 익명 방문: ${data.anonymous_visits}\n`);

        if (data.user_list && data.user_list.length > 0) {
            console.log(`👥 사용자 목록 (총 ${data.user_list.length}명):\n`);

            data.user_list.slice(0, 5).forEach((user, index) => {
                console.log(`${index + 1}. ${user.nickname || '알 수 없는 사용자'}`);
                console.log(`   - 방문 횟수: ${user.visitCount}회`);

                if (user.avgDuration !== undefined) {
                    const minutes = Math.floor(user.avgDuration / 60);
                    const seconds = Math.floor(user.avgDuration % 60);
                    console.log(`   - 평균 체류 시간: ${minutes}분 ${seconds}초 (${user.avgDuration.toFixed(1)}초)`);
                } else {
                    console.log('   - 평균 체류 시간: ❌ avgDuration 필드 없음');
                }

                console.log(`   - 최근 방문: ${new Date(user.visitLogs[0]).toLocaleString('ko-KR')}\n`);
            });

            // avgDuration 필드 검증
            const hasAvgDuration = data.user_list.every(u => u.avgDuration !== undefined);
            if (hasAvgDuration) {
                console.log('✅ 모든 사용자에게 avgDuration 필드가 있습니다.');

                const usersWithDuration = data.user_list.filter(u => u.avgDuration > 0);
                console.log(`✅ 체류 시간이 있는 사용자: ${usersWithDuration.length}/${data.user_list.length}명`);
            } else {
                console.log('❌ 일부 사용자에게 avgDuration 필드가 없습니다!');
            }
        } else {
            console.log('ℹ️  오늘 로그인한 사용자가 없습니다.');
        }

    } catch (err) {
        console.error('❌ 예외 발생:', err);
    }
}

verifyRPCUpdate();
