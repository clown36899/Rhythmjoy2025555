
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = '[REDACTED_ANON_KEY]';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkDate() {
    console.log('Checking min session_start...');
    const { data, error } = await supabase
        .from('session_logs')
        .select('session_start')
        .order('session_start', { ascending: true })
        .limit(5);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Earliest 5 Sessions:', data);
    }
}

checkDate();
