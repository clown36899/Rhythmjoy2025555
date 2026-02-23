
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

async function verifyRecovery() {
    console.log('[Verification] Checking what UI will display...\n');

    // Call the same RPC that the UI uses
    const { data, error } = await supabase.rpc('get_analytics_summary_v2', {
        start_date: '2020-01-01T00:00:00+09:00',
        end_date: '2030-12-31T23:59:59+09:00'
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    console.log(`Total Visits: ${data.total_visits}`);
    console.log(`Logged In Visits: ${data.logged_in_visits}`);
    console.log(`Anonymous Visits: ${data.anonymous_visits}`);
    console.log(`\nTotal Users in List: ${data.user_list.length}`);

    // Find specific users
    const joje = data.user_list.find(u => u.nickname && u.nickname.includes('Joje'));
    const testAccount = data.user_list.find(u => u.nickname && u.nickname.includes('앱테스트'));

    console.log('\n[Key Users]');
    if (joje) {
        console.log(`Joje: ${joje.visitCount} visits`);
    } else {
        console.log('Joje: NOT FOUND in user list');
    }

    if (testAccount) {
        console.log(`앱테스트계정: ${testAccount.visitCount} visits`);
    } else {
        console.log('앱테스트계정: NOT FOUND in user list');
    }

    // Show top 10 users by visit count
    console.log('\n[Top 10 Users by Visit Count]');
    const sorted = [...data.user_list].sort((a, b) => b.visitCount - a.visitCount);
    sorted.slice(0, 10).forEach((u, i) => {
        console.log(`${i + 1}. ${u.nickname}: ${u.visitCount} visits`);
    });
}

verifyRecovery();
