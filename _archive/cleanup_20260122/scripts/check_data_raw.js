const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

async function fetchData() {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const logsRes = await fetch(`${SUPABASE_URL}/rest/v1/site_analytics_logs?select=target_id,target_type,target_title,is_admin,user_id,fingerprint,created_at&order=created_at.desc&limit=100`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const logs = await logsRes.json();

    console.log('--- Recent Logs (Service Key) ---');
    const filtered = logs.filter(l => l.target_title && (l.target_title.includes('3주년') || l.target_title.includes('N8')));
    console.log(JSON.stringify(filtered, null, 2));

    if (filtered.length > 0) {
        const id = filtered[0].target_id;
        const type = filtered[0].target_type;

        // Check item_views
        const itemViewsRes = await fetch(`${SUPABASE_URL}/rest/v1/item_views?item_id=eq.${id}&item_type=eq.${type}&select=*`, {
            headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        const itemViews = await itemViewsRes.json();
        console.log('--- item_views Records ---');
        console.log(itemViews);

        // Check actual table
        const table = type === 'event' ? 'events' : 'social_schedules';
        const tableRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=id,title,views`, {
            headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        const tableData = await tableRes.json();
        console.log(`--- ${table} Record ---`);
        console.log(tableData);
    }
}

fetchData();
