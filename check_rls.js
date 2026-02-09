
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

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
