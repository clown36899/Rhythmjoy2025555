
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// Prefer Service Key for admin access, fallback to Anon key
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env');
    console.log('Available Env Keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Connecting to Supabase:', supabaseUrl);

    // 1. Push Subscriptions
    const { data, error } = await supabase
        .from('user_push_subscriptions')
        .select('user_id, endpoint, created_at, updated_at')
        .order('user_id')
        .limit(10);

    if (error) {
        console.error('Error querying user_push_subscriptions:', error);
    } else if (data) {
        console.log('--- Subscriptions Data Analysis ---');
        const userGroups: Record<string, any[]> = {};
        data.forEach(row => {
            if (!userGroups[row.user_id]) userGroups[row.user_id] = [];
            userGroups[row.user_id].push(row);
        });

        Object.keys(userGroups).forEach(uid => {
            const list = userGroups[uid];
            if (list.length > 1) {
                console.log(`\n🚨 [DUPLICATE] User ID: ${uid}`);
                list.forEach((entry, i) => {
                    console.log(`   #${i} | Endpoint: ${entry.endpoint?.substring(0, 50)}... | Updated: ${entry.updated_at}`);
                });
            }
        });
    }

    // 2. PWA Installs Diagnosis
    console.log('\n--- PWA Installs Data Analysis ---');
    const { data: pwaData, error: pwaError } = await supabase
        .from('pwa_installs')
        .select('user_id, fingerprint, installed_at')
        .order('installed_at', { ascending: false });

    if (pwaError) {
        console.error('Error querying pwa_installs:', pwaError);
    } else if (pwaData) {
        console.log(`Total Rows in pwa_installs: ${pwaData.length}`);

        const uniqueUsers = new Set(pwaData.map(d => d.user_id).filter(Boolean));
        const uniqueFingerprints = new Set(pwaData.map(d => d.fingerprint).filter(Boolean));

        const combinedUniques = new Set();
        pwaData.forEach(d => {
            if (d.user_id) combinedUniques.add(`uid:${d.user_id}`);
            else if (d.fingerprint) combinedUniques.add(`fp:${d.fingerprint}`);
            else combinedUniques.add(`id:${Math.random()}`); // Fallback for very old/broken data
        });

        console.log(`Unique Users (Logged-in): ${uniqueUsers.size}`);
        console.log(`Unique Fingerprints (Total): ${uniqueFingerprints.size}`);
        console.log(`Combined Unique Installs (Best Count): ${combinedUniques.size}`);

        const fpCounts: Record<string, number> = {};
        pwaData.forEach(d => {
            if (d.fingerprint) fpCounts[d.fingerprint] = (fpCounts[d.fingerprint] || 0) + 1;
        });

        const sortedFp = Object.entries(fpCounts)
            .filter(([_, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sortedFp.length > 0) {
            console.log('\n🚨 Top Duplicate Fingerprints:');
            sortedFp.forEach(([fp, count]) => {
                console.log(`   FP: ${fp.substring(0, 20)}... | Count: ${count}`);
            });
        }
    }
}

checkSchema();
