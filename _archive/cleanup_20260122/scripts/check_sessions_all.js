const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = '[REDACTED_SERVICE_ROLE_KEY]';

async function checkSessions() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/session_logs?select=*&order=session_start.desc&limit=100`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const sessions = await res.json();

    console.log('--- Recent Session Logs (Total) ---');
    console.log('Count returned:', sessions.length);
    if (sessions.length > 0) {
        console.log('First 3 records:', JSON.stringify(sessions.slice(0, 3), null, 2));
    }

    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/session_logs?select=count`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' }
    });
    console.log('Total Session Count (Exact):', countRes.headers.get('content-range'));

    // Check site_analytics_logs to confirm tracking is working for clicks
    const clickRes = await fetch(`${SUPABASE_URL}/rest/v1/site_analytics_logs?select=count`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' }
    });
    console.log('Total Click Logs Count:', clickRes.headers.get('content-range'));
}

checkSessions();
