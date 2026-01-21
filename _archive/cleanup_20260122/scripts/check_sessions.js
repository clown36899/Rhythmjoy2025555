const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

async function checkSessions() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/session_logs?select=*&order=session_start.desc&limit=20`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const sessions = await res.json();

    console.log('--- Recent Session Logs ---');
    console.log(JSON.stringify(sessions, null, 2));

    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/session_logs?select=count`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' }
    });
    console.log('Total Session Count:', countRes.headers.get('content-range'));
}

checkSessions();
