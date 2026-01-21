const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

async function checkClicks() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_analytics_logs?select=created_at,target_title,is_admin&order=created_at.desc&limit=10`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const logs = await res.json();

    console.log('--- Recent Click Logs ---');
    console.log(JSON.stringify(logs, null, 2));
}

checkClicks();
