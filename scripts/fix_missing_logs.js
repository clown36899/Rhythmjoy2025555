
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
// CRITICAL: Use Service Key to bypass RLS for UPDATE
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials (URL or Service Key) in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateLogs() {
    const nicknameTarget = 'Joje';
    console.log(`[Migration] Starting data recovery for '${nicknameTarget}'...`);

    // 1. Find User
    const { data: users } = await supabase
        .from('board_users')
        .select('user_id, nickname')
        .ilike('nickname', `%${nicknameTarget}%`);

    if (!users || users.length === 0) {
        console.log('User not found.');
        return;
    }
    const targetUser = users[0];
    console.log(`Target User: ${targetUser.nickname} (${targetUser.user_id})`);

    // 2. Identify Fingerprints from confirmed logins
    const { data: userLogs, error: userError } = await supabase
        .from('site_analytics_logs')
        .select('fingerprint')
        .eq('user_id', targetUser.user_id);

    if (userError) {
        console.error('Error fetching logs:', userError);
        return;
    }

    const validFingerprints = [...new Set(userLogs.map(l => l.fingerprint).filter(Boolean))];

    if (validFingerprints.length === 0) {
        console.log('No existing fingerprints found for this user. Cannot link anonymous logs.');
        return;
    }

    console.log(`Associated Fingerprints: ${validFingerprints.join(', ')}`);

    // 3. Perform Update (Link Anonymous Logs)
    // Update site_analytics_logs SET user_id = targetUser.user_id WHERE fingerprint IN (...) AND user_id IS NULL

    const { data: updateResult, error: updateError } = await supabase
        .from('site_analytics_logs')
        .update({ user_id: targetUser.user_id })
        .in('fingerprint', validFingerprints)
        .is('user_id', null) // Only update currently anonymous ones
        .select(); // Return updated rows to count them

    if (updateError) {
        console.error('Migration Failed:', updateError);
    } else {
        console.log(`\n[SUCCESS] Successfully migrated ${updateResult.length} anonymous logs to user '${targetUser.nickname}'.`);
        console.log('These visits will now appear in the user analytics history.');
    }
}

migrateLogs();
