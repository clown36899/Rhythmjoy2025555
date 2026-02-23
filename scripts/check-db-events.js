import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파싱 함수 (간단 구현)
function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return {};

    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim();
        }
    });
    return env;
}

// 시작/종료일 파라미터 받기
const startDate = process.argv[2];
const endDate = process.argv[3];

if (!startDate || !endDate) {
    console.error('사용법: node scripts/check-db-events.js YYYY-MM-DD YYYY-MM-DD');
    process.exit(1);
}

const env = loadEnv();
const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('오류: .env 파일에서 Supabase URL 또는 Key를 찾을 수 없습니다.');
    process.exit(1);
}

async function fetchEvents() {
    // events 테이블 조회 (지정된 기간 내의 모든 이벤트)
    const url = `${supabaseUrl}/rest/v1/events?select=id,date,title,category,venue_name,link_name1&date=gte.${startDate}&date=lte.${endDate}&order=date.asc`;

    try {
        const response = await fetch(url, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP 오류: ${response.status}`);
        }

        const events = await response.json();

        console.log(`\n=== 📅 ${startDate} ~ ${endDate} DB 등록 이벤트 (총 ${events.length}건) ===\n`);

        if (events.length === 0) {
            console.log('등록된 이벤트가 없습니다.');
        } else {
            // 카테고리별/날짜별로 그룹화 표시
            events.forEach((ev) => {
                const category = ev.category === 'social' ? '🎶 소셜' : (ev.category === 'class' ? '🎓 강습' : '🎸 기타');
                const source = ev.link_name1 ? `[소스: ${ev.link_name1}]` : '';
                console.log(`- ${ev.date} | ${category} | ${ev.title} | ${ev.venue_name || '장소미상'} ${source}`);
            });
            console.log('\n======================================================\n');
            console.log('💡 AI 에이전트 지침: 위 목록에 이미 등록된 날짜/소스 조합이 있다면, 해당 날짜의 소스 리서치는 "이미 등록됨"으로 처리하고 건너뛰세요.');
        }
    } catch (e) {
        console.error('데이터베이스 조회 실패:', e.message);
    }
}

fetchEvents();
