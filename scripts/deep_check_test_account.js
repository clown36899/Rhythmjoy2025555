
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars manually
const envPath = path.resolve(process.cwd(), '.env');
let envConfig = {};

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...obj] = line.split('=');
        if (key && obj) {
            envConfig[key.trim()] = obj.join('=').trim().replace(/^["']|["']$/g, '');
        }
    });
} catch (e) {
    console.error('Could not read .env file:', e);
}

const supabaseUrl = envConfig.VITE_PUBLIC_SUPABASE_URL || envConfig.VITE_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials (URL or Service Key) in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deepInvestigation() {
    const targetUserId = '91b04b25-7449-4d64-8fc2-4e328b2659ab'; // 앱테스트계정

    console.log('[Deep Investigation] 앱테스트계정 전수 조사\n');

    // 1. Get all fingerprints ever used by this user
    const { data: userLogs } = await supabase
        .from('site_analytics_logs')
        .select('fingerprint, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: true });

    const allFingerprints = [...new Set(userLogs.map(l => l.fingerprint).filter(Boolean))];

    console.log(`User has used ${allFingerprints.length} different fingerprints:`);
    allFingerprints.forEach(fp => console.log(`  - ${fp}`));

    console.log(`\nFirst activity: ${userLogs[0]?.created_at}`);
    console.log(`Last activity: ${userLogs[userLogs.length - 1]?.created_at}`);

    // 2. Check for any remaining anonymous logs with these fingerprints
    console.log('\n[Checking for remaining anonymous logs...]');

    for (const fp of allFingerprints) {
        const { data: anonLogs } = await supabase
            .from('site_analytics_logs')
            .select('created_at, target_type')
            .eq('fingerprint', fp)
            .is('user_id', null)
            .order('created_at', { ascending: false });

        if (anonLogs && anonLogs.length > 0) {
            console.log(`\nFingerprint [${fp}] still has ${anonLogs.length} anonymous logs!`);
            console.log('Sample dates:');
            anonLogs.slice(0, 5).forEach(log => console.log(`  - ${log.created_at}`));
        }
    }

    // 3. Calculate 6-hour deduplicated visits
    const buckets = new Set();
    userLogs.forEach(l => {
        const ts = new Date(l.created_at).getTime();
        const bucket = Math.floor(ts / (6 * 3600 * 1000));
        buckets.add(bucket);
    });

    console.log(`\n[Summary]`);
    console.log(`Total raw logs: ${userLogs.length}`);
    console.log(`6-hour deduplicated visits: ${buckets.size}`);
}

deepInvestigation();
