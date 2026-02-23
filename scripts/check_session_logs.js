// session_logs 테이블 데이터 확인 스크립트
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

console.log('🔍 session_logs 테이블 데이터 확인...\n');

// 1. Total count
const { count: totalCount } = await supabase
    .from('session_logs')
    .select('*', { count: 'exact', head: true });

console.log(`📊 전체 session_logs 레코드 수: ${totalCount}`);

// 2. Count with duration > 0
const { count: withDuration } = await supabase
    .from('session_logs')
    .select('*', { count: 'exact', head: true })
    .not('duration_seconds', 'is', null)
    .gt('duration_seconds', 0);

console.log(`✅ duration_seconds > 0인 레코드 수: ${withDuration}`);

// 3. Count with user_id
const { count: withUserId } = await supabase
    .from('session_logs')
    .select('*', { count: 'exact', head: true })
    .not('user_id', 'is', null);

console.log(`👤 user_id가 있는 레코드 수: ${withUserId}`);

// 4. Count with both
const { count: withBoth } = await supabase
    .from('session_logs')
    .select('*', { count: 'exact', head: true })
    .not('user_id', 'is', null)
    .not('duration_seconds', 'is', null)
    .gt('duration_seconds', 0);

console.log(`✅ user_id + duration > 0인 레코드 수: ${withBoth}\n`);

// 5. Sample data
const { data: sampleData } = await supabase
    .from('session_logs')
    .select('user_id, duration_seconds, created_at')
    .not('user_id', 'is', null)
    .not('duration_seconds', 'is', null)
    .gt('duration_seconds', 0)
    .order('created_at', { ascending: false })
    .limit(10);

console.log('📋 최근 10개 샘플 (user_id + duration > 0):');
sampleData.forEach((row, i) => {
    console.log(`${i + 1}. user_id: ${row.user_id.substring(0, 8)}..., duration: ${row.duration_seconds}초, created_at: ${row.created_at}`);
});
