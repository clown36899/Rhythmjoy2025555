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

const env = loadEnv();
const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('오류: .env 파일에서 Supabase URL 또는 Key를 찾을 수 없습니다.');
    process.exit(1);
}

async function exportFullEvents() {
    // 모든 이벤트 조회 (제한 없이)
    const url = `${supabaseUrl}/rest/v1/events?select=*&order=date.desc`;

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
        const outputPath = path.resolve(__dirname, '../src/data/db_events_backup.json');

        fs.writeFileSync(outputPath, JSON.stringify(events, null, 2), 'utf8');

        console.log(`\n=== ✅ 데이터 수출 완료 ===`);
        console.log(`- 추출된 총 이벤트 건수: ${events.length}건`);
        console.log(`- 저장 위치: ${outputPath}`);
        console.log(`===========================\n`);

    } catch (e) {
        console.error('데이터베이스 추출 실패:', e.message);
    }
}

exportFullEvents();
