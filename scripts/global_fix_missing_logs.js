
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

async function globalMigration() {
    console.log('[Global Migration] Starting comprehensive data recovery...\n');

    // 1. Get all users who have at least one logged-in record
    const { data: userLogs, error: logsError } = await supabase
        .from('site_analytics_logs')
        .select('user_id, fingerprint')
        .not('user_id', 'is', null)
        .not('fingerprint', 'is', null);

    if (logsError) {
        console.error('Error fetching logs:', logsError);
        return;
    }

    console.log(`Found ${userLogs.length} logged-in activity records.`);

    // 2. Build a map: fingerprint -> user_id
    const fingerprintMap = new Map();

    userLogs.forEach(log => {
        if (!fingerprintMap.has(log.fingerprint)) {
            fingerprintMap.set(log.fingerprint, log.user_id);
        } else {
            // If fingerprint is shared by multiple users, skip it (ambiguous)
            const existingUserId = fingerprintMap.get(log.fingerprint);
            if (existingUserId !== log.user_id) {
                fingerprintMap.set(log.fingerprint, 'CONFLICT'); // Mark as conflicted
            }
        }
    });

    // 3. Filter out conflicted fingerprints (safety measure)
    const validFingerprints = Array.from(fingerprintMap.entries())
        .filter(([fp, userId]) => userId !== 'CONFLICT')
        .reduce((acc, [fp, userId]) => {
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(fp);
            return acc;
        }, {});

    console.log(`\nIdentified ${Object.keys(validFingerprints).length} users with unique fingerprints.`);

    // 4. For each user, update anonymous logs
    let totalMigrated = 0;

    for (const [userId, fingerprints] of Object.entries(validFingerprints)) {
        if (fingerprints.length === 0) continue;

        const { data: updateResult, error: updateError } = await supabase
            .from('site_analytics_logs')
            .update({ user_id: userId })
            .in('fingerprint', fingerprints)
            .is('user_id', null)
            .select();

        if (updateError) {
            console.error(`Error migrating for user ${userId}:`, updateError);
        } else if (updateResult && updateResult.length > 0) {
            totalMigrated += updateResult.length;
            console.log(`✓ User ${userId}: Migrated ${updateResult.length} anonymous logs`);
        }
    }

    console.log(`\n[COMPLETE] Total logs migrated: ${totalMigrated}`);
    console.log('All misattributed anonymous data has been recovered.');
}

globalMigration();
