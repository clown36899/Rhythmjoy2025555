import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function testUpsert() {
    const sessionId = 'test_sess_' + Date.now();
    console.log('Testing UPSERT with session_id:', sessionId);

    const { data, error } = await supabase.from('session_logs').upsert({
        session_id: sessionId,
        user_id: null,
        fingerprint: 'test_fp',
        is_admin: false,
        entry_page: '/test',
        session_start: new Date().toISOString()
    }, {
        onConflict: 'session_id'
    });

    if (error) {
        console.error('UPSERT Error:', error);
    } else {
        console.log('UPSERT Success:', data);
    }
}

testUpsert();
