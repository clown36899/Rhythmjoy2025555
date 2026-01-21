const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

async function getFullSchema() {
    const tables = ['session_logs', 'billboard_users', 'site_analytics_logs', 'pwa_installs', 'item_views'];

    // Since we can't easily query information_schema via PostgREST without an RPC,
    // we'll use a trick: query the tables with a limit of 0 and check the response or try to induce a schema error
    // OR we can use the 'Prefer: head=true' to get headers, but it won't show all columns if empty.

    // Actually, let's try to find an existing RPC that might allow us to see schema or just use GET on each table
    // with a very broad select.

    console.log('--- Table Schemas (via REST API) ---');
    for (const table of tables) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`
            }
        });
        const data = await res.json();
        console.log(`\nTABLE: ${table}`);
        if (data && data.length > 0) {
            console.log('Columns found in record:', Object.keys(data[0]));
            // Try to determine types
            const types = {};
            for (const [k, v] of Object.entries(data[0])) {
                types[k] = v === null ? 'NULL' : typeof v;
            }
            console.log('Types (Best guess):', types);
        } else {
            console.log('Table is empty. Checking via OPTIONS if supported...');
            const optRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
                method: 'OPTIONS',
                headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
            });
            // OPTIONS output is huge, let's just log if it works
            console.log('OPTIONS status:', optRes.status);
        }
    }
}

getFullSchema();
