
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findUser() {
    console.log('Fetching all users to find ID starting with 91b04b25...');
    const { data, error } = await supabase
        .from('billboard_users')
        .select('id, name')
        .limit(1000);

    if (error) {
        console.error('Error:', error);
        return;
    }

    const target = data.find(d => d.id.startsWith('91b04b25'));

    if (target) {
        console.log('FOUND:', target);
    } else {
        console.log('Not found in user list.');
    }
}

findUser();
