
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

async function fixRemainingLogs() {
    const targetUserId = '91b04b25-7449-4d64-8fc2-4e328b2659ab';
    const missingFingerprint = 'fp_8kj8wi74zk4mk79gwe1';

    console.log('[Final Fix] Recovering remaining 68 logs for 앱테스트계정...\n');

    const { data: updateResult, error } = await supabase
        .from('site_analytics_logs')
        .update({ user_id: targetUserId })
        .eq('fingerprint', missingFingerprint)
        .is('user_id', null)
        .select();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`✓ Successfully migrated ${updateResult.length} additional logs`);

        // Verify total
        const { count } = await supabase
            .from('site_analytics_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', targetUserId);

        console.log(`\nTotal logs for 앱테스트계정: ${count}`);

        // Calculate visits
        const { data: allLogs } = await supabase
            .from('site_analytics_logs')
            .select('created_at')
            .eq('user_id', targetUserId);

        const buckets = new Set();
        allLogs.forEach(l => {
            const ts = new Date(l.created_at).getTime();
            const bucket = Math.floor(ts / (6 * 3600 * 1000));
            buckets.add(bucket);
        });

        console.log(`6-hour deduplicated visits: ${buckets.size}`);
    }
}

fixRemainingLogs();
