import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// .env 로드 (프로젝트 루트 기준)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing credentials in .env');
    console.log('URL:', supabaseUrl);
    console.log('KEY:', supabaseServiceKey ? '(Present)' : '(Missing)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function testRPC() {
    console.log('🔄 Testing refresh_site_metrics RPC...');

    const startTime = Date.now();
    const { data, error } = await supabase.rpc('refresh_site_metrics');
    const endTime = Date.now();

    if (error) {
        console.error('❌ RPC Failed!');
        console.error('Error Details:', JSON.stringify(error, null, 2));
        process.exit(1);
    } else {
        console.log('✅ RPC Success!');
        console.log(`⏱️ Duration: ${(endTime - startTime) / 1000}s`);
        // console.log('Data:', JSON.stringify(data, null, 2)); // Too verbose
        console.log('Data Keys:', Object.keys(data));
        console.log('Member Count:', data.memberCount);
        console.log('Event AVG:', data.eventDailyAvg);
    }
}

testRPC();
