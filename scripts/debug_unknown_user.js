import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    const targetIdPrefix = '9b9cfc76';
    
    // 1. Find the full user_id from logs
    const { data: logSample } = await supabase
        .from('site_analytics_logs')
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(2000);

    const ids = [...new Set(logSample.map(l => l.user_id))];
    const targetId = ids.find(id => id.startsWith(targetIdPrefix));
    
    if (targetId) {
        console.log('Target User ID found in logs:', targetId);
    } else {
        console.log('Target User ID prefix not found in sampled logs. Searching broadly...');
        // Search more specifically
        const { data: broadSearch } = await supabase
            .from('site_analytics_logs')
            .select('user_id')
            .not('user_id', 'is', null);
            
        const broadIds = [...new Set(broadSearch.map(l => l.user_id))];
        const found = broadIds.find(id => id.startsWith(targetIdPrefix));
        if (found) console.log('Found ID in broad search:', found);
        else {
            console.log('Could not find user starting with', targetIdPrefix);
            return;
        }
    }

    const fullUserId = targetId || ids.find(id => id.startsWith(targetIdPrefix));

    // 2. Check board_users
    const { data: userData, error: userError } = await supabase
        .from('board_users')
        .select('*')
        .eq('user_id', fullUserId)
        .single();

    if (userError) {
        console.log('Error fetching user from board_users:', userError.message);
        if (userError.code === 'PGRST116') {
            console.log('CRITICAL: User exists in logs but DARK MATTER! (Not in board_users table)');
        }
    } else {
        console.log('User found in board_users:', userData);
    }
    
    // 3. Count orphans
    const { data: allLogs } = await supabase.from('site_analytics_logs').select('user_id').not('user_id', 'is', null);
    const uniqueIds = [...new Set(allLogs.map(l => l.user_id))];
    
    const { data: allUsers } = await supabase.from('board_users').select('user_id');
    const userSet = new Set(allUsers.map(u => u.user_id));
    
    const orphans = uniqueIds.filter(id => !userSet.has(id));
    console.log('Total Orphans (in logs but not in board_users):', orphans.length);
    if (orphans.length > 0) {
        console.log('Sample orphans:', orphans.slice(0, 3));
    }
}

run();
