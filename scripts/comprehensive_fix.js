
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

async function comprehensiveFix() {
    console.log('[Comprehensive Fix] Finding all users and their fingerprints...\n');

    // 1. Get ALL fingerprints used by each user (from logged-in records)
    const { data: userLogs } = await supabase
        .from('site_analytics_logs')
        .select('user_id, fingerprint')
        .not('user_id', 'is', null)
        .not('fingerprint', 'is', null);

    // Build map: user_id -> Set of all fingerprints
    const userFingerprintMap = new Map();

    userLogs.forEach(log => {
        if (!userFingerprintMap.has(log.user_id)) {
            userFingerprintMap.set(log.user_id, new Set());
        }
        userFingerprintMap.get(log.user_id).add(log.fingerprint);
    });

    console.log(`Found ${userFingerprintMap.size} users with logged-in activity`);

    // 2. For each user, check for anonymous logs with ANY of their fingerprints
    let totalFixed = 0;
    let usersFixed = 0;

    for (const [userId, fingerprints] of userFingerprintMap.entries()) {
        const fingerprintArray = Array.from(fingerprints);

        // Check for anonymous logs
        const { data: anonLogs } = await supabase
            .from('site_analytics_logs')
            .select('id', { count: 'exact', head: true })
            .in('fingerprint', fingerprintArray)
            .is('user_id', null);

        if (anonLogs && anonLogs.length > 0) {
            // Migrate these logs
            const { data: updateResult, error } = await supabase
                .from('site_analytics_logs')
                .update({ user_id: userId })
                .in('fingerprint', fingerprintArray)
                .is('user_id', null)
                .select();

            if (!error && updateResult && updateResult.length > 0) {
                totalFixed += updateResult.length;
                usersFixed++;
                console.log(`✓ User ${userId.substring(0, 8)}...: Fixed ${updateResult.length} logs (${fingerprints.size} fingerprints)`);
            }
        }
    }

    console.log(`\n[COMPLETE]`);
    console.log(`Users affected: ${usersFixed}`);
    console.log(`Total logs recovered: ${totalFixed}`);
}

comprehensiveFix();
