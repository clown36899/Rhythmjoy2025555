const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = '[REDACTED_SERVICE_ROLE_KEY]';

async function checkClicks() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_analytics_logs?select=created_at,target_title,is_admin&order=created_at.desc&limit=10`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const logs = await res.json();

    console.log('--- Recent Click Logs ---');
    console.log(JSON.stringify(logs, null, 2));
}

checkClicks();
