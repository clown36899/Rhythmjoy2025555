const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use Service Key to bypass RLS

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase environment variables missing.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySessionData() {
    console.log('--- Verifying Session Data (KST Today) ---');

    // Calculate Today KST range
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const nowKST = new Date(now.getTime() + kstOffset);
    const todayStr = nowKST.toISOString().split('T')[0]; // YYYY-MM-DD

    const startStr = `${todayStr}T00:00:00+09:00`;
    const endStr = `${todayStr}T23:59:59+09:00`;

    console.log(`Checking range: ${startStr} ~ ${endStr}`);

    // 1. Fetch Session Logs
    const { data: logs, error } = await supabase
        .from('session_logs')
        .select('*')
        .gte('session_start', startStr)
        .lte('session_start', endStr);

    if (error) {
        console.error('Error fetching session_logs:', error);
        return;
    }

    console.log(`Total sessions found: ${logs.length}`);

    let loggedIn = 0;
    let guest = 0;
    let admin = 0;
    const userFingerprints = new Set();
    const guestFingerprints = new Set();
    const dedupedGuestFingerprints = new Set();

    logs.forEach(log => {
        if (log.is_admin) {
            admin++;
            return;
        }

        if (log.user_id) {
            loggedIn++;
            if (log.fingerprint) userFingerprints.add(log.fingerprint);
        } else {
            guest++;
            if (log.fingerprint) guestFingerprints.add(log.fingerprint);
        }
    });

    // Dedup logic (Frontend simulation)
    guestFingerprints.forEach(fp => {
        if (!userFingerprints.has(fp)) {
            dedupedGuestFingerprints.add(fp);
        }
    });

    console.log('--- Breakdown ---');
    console.log(`Admin Sessions: ${admin}`);
    console.log(`User Sessions (Raw): ${loggedIn}`);
    console.log(`Guest Sessions (Raw): ${guest}`);
    console.log(`Unique User Fingerprints: ${userFingerprints.size}`);
    console.log(`Unique Guest Fingerprints: ${guestFingerprints.size}`);
    console.log(`Deduped Guest Count (Guest FP - User FP): ${dedupedGuestFingerprints.size}`);

    console.log(`\nEXPECTED DASHBOARD HERO NUMBER: ${userFingerprints.size + dedupedGuestFingerprints.size}`);
    console.log(`User: ${userFingerprints.size}, Guest: ${dedupedGuestFingerprints.size}`);

    // 2. Sample Data
    if (logs.length > 0) {
        console.log('\n--- Sample Log ---');
        console.log(logs[0]);
    }
}

verifySessionData();
