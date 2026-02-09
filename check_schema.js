
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

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
