
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = '[REDACTED_ANON_KEY]';

async function checkRLS() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('Checking read access to board_posts with ANON key...');

    const { data, error } = await supabase
        .from('board_posts')
        .select('id, title, category')
        .eq('category', 'free')
        .limit(5);

    if (error) {
        console.error('❌ Failed to fetch data:', error);
        console.error('Possible RLS issue: The policy might be blocking SELECT access.');
    } else {
        console.log(`✅ Successfully fetched ${data.length} rows.`);
        console.log('Sample data:', data);
        console.log('RLS seems to allow reading public posts.');
    }
}

checkRLS();
