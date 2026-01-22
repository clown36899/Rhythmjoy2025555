
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
let envConfig = {};

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...obj] = line.split('=');
        if (key && obj) {
            envConfig[key.trim()] = obj.join('=').trim().replace(/^["']|["']$/g, ''); // Remove quotes
        }
    });
} catch (e) {
    console.error('Could not read .env file:', e);
}

const supabaseUrl = envConfig.VITE_PUBLIC_SUPABASE_URL || envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_PUBLIC_SUPABASE_ANON_KEY || envConfig.VITE_SUPABASE_ANON_KEY;
// Fallback to process.env if available (e.g. if run with --env-file)
// but manual parse is safest here.

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file');
    // console.log('Found keys:', Object.keys(envConfig)); 
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyUserVisits() {
    const partialId = '32bf4d3b';
    console.log(`[Debug] Calling RPC get_analytics_summary_v2 for user ${partialId}...`);

    // Call the RPC that the app uses, with a very wide date range
    const { data, error } = await supabase.rpc('get_analytics_summary_v2', {
        start_date: '2020-01-01T00:00:00+09:00',
        end_date: '2030-12-31T23:59:59+09:00'
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    // data is { total_visits, ... user_list: [] }
    const userList = data.user_list || [];
    console.log(`[Debug] Total users in list: ${userList.length}`);

    const found = userList.find(u => u.user_id && u.user_id.startsWith(partialId));

    if (found) {
        console.log(`\n[FOUND USER]`);
        console.log(`Nickname: ${found.nickname}`);
        console.log(`User ID: ${found.user_id}`);
        console.log(`Visit Count: ${found.visitCount} (Raw from DB)`);
        console.log(`Visit Logs:`);
        found.visitLogs.forEach(log => console.log(` - ${log}`));
    } else {
        console.log(`\n[NOT FOUND] User beginning with ${partialId} not found in RPC result.`);
        console.log('Top 5 users by visit count:');
        userList.slice(0, 5).forEach(u => console.log(`${u.nickname} (${u.visitCount})`));
    }
}

verifyUserVisits();
