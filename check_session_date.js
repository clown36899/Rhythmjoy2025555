
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

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
