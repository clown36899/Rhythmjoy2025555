
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
// CRITICAL: Use Service Key to bypass RLS
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials (URL or Service Key) in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyUserVisits() {
    const nicknameTarget = 'Joje';
    console.log(`[Forensic - DEEP SCAN] Searching for ALL users matching '${nicknameTarget}'`);

    // 1. Find ALL matching users
    const { data: users } = await supabase
        .from('board_users')
        .select('user_id, nickname, created_at')
        .ilike('nickname', `%${nicknameTarget}%`);

    if (!users || users.length === 0) {
        console.log('No users found.');
        return;
    }

    console.log(`Found ${users.length} user(s). Analyzing each...`);

    for (const user of users) {
        console.log(`\n================================`);
        console.log(`USER: ${user.nickname} (${user.user_id})`);
        console.log(`Signup: ${user.created_at}`);

        // 2. Fetch User-Bound Logs
        const { data: userLogs, error: userError } = await supabase
            .from('site_analytics_logs')
            .select('created_at, target_type, fingerprint')
            .eq('user_id', user.user_id)
            .order('created_at', { ascending: false });

        if (userError) {
            console.error('Error fetching user logs:', userError);
            continue;
        }

        console.log(`User-Bound Logs: ${userLogs.length}`);

        if (userLogs.length > 0) {
            // 3. Extract Fingerprints
            const fingerprints = [...new Set(userLogs.map(l => l.fingerprint).filter(Boolean))];
            console.log(`Details: Last seen ${userLogs[0].created_at}`);
            console.log(`Sub-Fingerprints detected: ${fingerprints.join(', ')}`);

            // 4. Trace Fingerprints (Anonymous History)
            if (fingerprints.length > 0) {
                console.log(`\n[FINGERPRINT TRACE] checking for anonymous activity...`);
                for (const fp of fingerprints) {
                    const { data: fpLogs } = await supabase
                        .from('site_analytics_logs')
                        .select('created_at, user_id, target_type')
                        .eq('fingerprint', fp)
                        .is('user_id', null) // Only anonymous ones
                        .order('created_at', { ascending: false });

                    if (fpLogs && fpLogs.length > 0) {
                        console.log(`Fingerprint [${fp}] has ${fpLogs.length} ANONYMOUS logs.`);
                        fpLogs.forEach(l => console.log(`  > ${l.created_at} (Anon)`));
                    } else {
                        console.log(`Fingerprint [${fp}] has no separate anonymous logs.`);
                    }
                }
            }
        } else {
            console.log('No logged-in activity found for this account.');
        }
    }
}

verifyUserVisits();
