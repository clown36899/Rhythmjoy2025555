
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = '[REDACTED_ANON_KEY]';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
    // 1. Find user by nickname (often users use their local name or common nicknames)
    console.log('--- User Check ---');
    const { data: users, error: userError } = await supabase
        .from('board_users')
        .select('*')
        .limit(10);

    if (userError) {
        console.error('User Error:', userError);
    } else {
        console.log('Recent Users:', users.map(u => ({ id: u.user_id, nickname: u.nickname })));
    }

    // 2. Check social_groups
    console.log('\n--- Social Groups Check ---');
    const { data: groups, error: groupError } = await supabase
        .from('social_groups')
        .select('id, name, user_id, type')
        .order('created_at', { ascending: false })
        .limit(10);

    if (groupError) {
        console.error('Group Error:', groupError);
    } else {
        console.log('Recent Groups:', groups);
    }
}

check();
