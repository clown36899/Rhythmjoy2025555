
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

async function findTopRecoveredUser() {
    const targetUserId = '91b04b25-7449-4d64-8fc2-4e328b2659ab'; // 212건 복구된 사용자

    console.log('[User Lookup] Finding user with most recovered logs...\n');

    // Get user info from board_users
    const { data: user } = await supabase
        .from('board_users')
        .select('user_id, nickname, created_at')
        .eq('user_id', targetUserId)
        .single();

    if (user) {
        console.log(`User with 212 recovered logs:`);
        console.log(`- Nickname: ${user.nickname}`);
        console.log(`- User ID: ${user.user_id}`);
        console.log(`- Joined: ${user.created_at}`);
    } else {
        console.log('User not found in board_users (might be deleted or auth-only)');
    }

    // Get total current logs for this user
    const { data: logs, count } = await supabase
        .from('site_analytics_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', targetUserId);

    console.log(`\nTotal logs now attributed to this user: ${count}`);
}

findTopRecoveredUser();
