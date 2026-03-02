import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파싱 함수
function loadEnvLocal() {
    const envPath = path.resolve(__dirname, '../.env.local');
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

const env = loadEnvLocal();
const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
    console.error('오류: .env.local 파일에서 SUPABASE_SERVICE_KEY를 찾을 수 없습니다.');
    process.exit(1);
}

async function importEvents() {
    const backupPath = path.resolve(__dirname, '../src/data/db_events_backup.json');
    if (!fs.existsSync(backupPath)) {
        console.error('오류: 백업 파일(db_events_backup.json)이 존재하지 않습니다.');
        process.exit(1);
    }

    const rawEvents = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    // 외래 키 제약 조건 위반 방지를 위해 venue_id 필드 제거
    const events = rawEvents.map(ev => {
        const { venue_id, ...rest } = ev;
        return rest;
    });
    console.log(`총 ${events.length}건의 데이터를 정제하여 이관합니다...`);

    // PostgREST upsert: POST with Prefer: resolution=merge-duplicates
    const url = `${supabaseUrl}/rest/v1/events`;

    try {
        // 대량 데이터의 경우 청크로 나누어 전송 (Supabase/PostgREST 제한 방지)
        const chunkSize = 50;
        for (let i = 0; i < events.length; i += chunkSize) {
            const chunk = events.slice(i, i + chunkSize);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(chunk)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP 오류 (${response.status}): ${errorText}`);
            }
            console.log(`청크 ${Math.floor(i / chunkSize) + 1} 완료 (${i + chunk.length}/${events.length})`);
        }

        console.log(`\n=== ✅ 데이터 이관 완료 ===`);
        console.log(`- 이관된 총 이벤트 건수: ${events.length}건`);
        console.log(`- 대상 DB: ${supabaseUrl}`);
        console.log(`===========================\n`);

    } catch (e) {
        console.error('데이터베이스 이관 실패:', e.message);
    }
}

importEvents();
