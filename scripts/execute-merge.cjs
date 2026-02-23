const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// .env 파일에서 환경변수 로드 시도 (dotenv가 있으면 사용)
try {
    require('dotenv').config();
} catch (e) {
    // dotenv가 없으면 수동으로 파싱하거나 무시 (Netlify CLI에서 이미 로드했을 가능성 있음)
}

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runMerge() {
    try {
        const sqlPath = path.join(process.cwd(), 'supabase', 'migrate_social_to_events.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🚀 Starting Social -> Events Table Merge...');

        // 세미콜론으로 문장 분리 (주석 및 빈 줄 제외)
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 70)}...`);

            // Supabase의 exec_sql RPC를 사용하여 SQL 실행
            const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

            if (error) {
                // 특정 에러(이미 존재함 등)는 경고로 처리
                if (error.message.includes('already exists')) {
                    console.warn(`⚠️ Warning: ${error.message}`);
                } else {
                    throw error;
                }
            }
        }

        console.log('✅ Migration executed successfully!');
    } catch (error) {
        console.error('❌ Error during migration:', error.message);
        process.exit(1);
    }
}

runMerge();
