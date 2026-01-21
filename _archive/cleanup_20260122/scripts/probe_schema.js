const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

async function probe() {
    console.log('--- Probing session_logs ---');
    const sRes = await fetch(`${SUPABASE_URL}/rest/v1/session_logs?limit=1`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const sData = await sRes.json();
    if (sData.length > 0) {
        console.log('Columns:', Object.keys(sData[0]));
        console.log('Sample Data Types:', Object.fromEntries(Object.entries(sData[0]).map(([k, v]) => [k, typeof v])));
    } else {
        console.log('session_logs is empty.');
    }

    console.log('\n--- Probing billboard_users ---');
    const bRes = await fetch(`${SUPABASE_URL}/rest/v1/billboard_users?limit=1`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const bData = await bRes.json();
    if (bData.length > 0) {
        console.log('Columns:', Object.keys(bData[0]));
    }

    console.log('\n--- Testing defined functions via RPC ---');
    const funcs = ['is_admin', 'get_user_admin_status'];
    for (const f of funcs) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${f}`, {
            method: 'POST',
            headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        console.log(`RPC ${f} exists:`, res.status === 200 || res.status === 406); // 406 might mean wrong args but exists
    }
}

probe();
