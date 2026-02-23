
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = '[REDACTED_ANON_KEY]';

async function checkSchema() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('Fetching one row from board_prefixes to check columns...');

    const { data, error } = await supabase
        .from('board_prefixes')
        .select('*')
        .limit(1);

    if (error) {
        console.error('❌ Failed to fetch:', error);
    } else {
        console.log('✅ Sample row:', data);
        if (data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        }
    }
}

checkSchema();
