import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    const { data: user } = await supabase
        .from('board_users')
        .select('user_id')
        .eq('nickname', '준')
        .limit(1);

    if (!user?.[0]) {
        console.error('User not found');
        return;
    }

    const userId = user[0].user_id;
    console.log('User ID for 준:', userId);

    const { data: logs } = await supabase
        .from('site_analytics_logs')
        .select('session_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (!logs) return;

    let currentSession = null;
    let minTime = null;
    let maxTime = null;

    console.log('\n--- Logs for 준 ---');
    logs.forEach(log => {
        console.log(`Session: ${log.session_id}, Time: ${log.created_at}`);
    });
}

run();
