const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

async function checkSchema() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/session_logs?limit=0`, {
        method: 'GET',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' }
    });
    console.log('Status:', res.status);

    // To get column types, we can use an RPC or just try a query that reveals types.
    // Actually, let's just query information_schema if possible, but PostgREST doesn't expose it.

    // Try inserting a record with all nulls EXCEPT session_id
    const testRes = await fetch(`${SUPABASE_URL}/rest/v1/session_logs`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ session_id: 'test_' + Date.now() })
    });
    const data = await testRes.json();
    console.log('Insert Result:', data);
}

checkSchema();
