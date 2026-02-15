
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function verify() {
    console.log('--- Verifying Data Mismatch ---');

    // --- Inspect Data Structure ---
    const { data: sampleEvent } = await supabase.from('events').select('*').limit(1).single();
    console.log('\n--- Data Structure Sample ---');
    if (sampleEvent) {
        for (const key in sampleEvent) {
            console.log(`${key} (${typeof sampleEvent[key]}): ${sampleEvent[key]}`);
        }
    }

    // 1. Check Social Schedules (Legacy Data)
    const { count: socialCount, error: socialError } = await supabase
        .from('social_schedules')
        .select('*', { count: 'exact', head: true });

    console.log(`[Legacy] social_schedules count: ${socialCount} (Error: ${socialError?.message || 'None'})`);

    // 2. Check Events (All Time) - used by current RPC (partially)
    const { count: allEventsCount, error: allEventsError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .not('category', 'in', '("notice","notice_popup","board")');

    console.log(`[Current RPC Logic] Total Events (All Time): ${allEventsCount}`);

    // 3. Check Events (Last 1 Year) - used by SwingSceneStats
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dateStr = oneYearAgo.toISOString();

    const { count: recentEventsCount, error: recentError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .not('category', 'in', '("notice","notice_popup","board")')
        .or(`created_at.gte.${dateStr},start_date.gte.${dateStr},date.gte.${dateStr},day_of_week.not.is.null`);

    console.log(`[SwingSceneStats Logic] Total Events (1 Year): ${recentEventsCount}`);

    // 4. Check RPC Failure
    console.log('--- Calling broken RPC ---');
    const { data: rpcResult, error: rpcError } = await supabase.rpc('refresh_site_metrics');
    if (rpcError) {
        console.log('RPC Error:', rpcError.message);
        console.log('RPC Details:', rpcError.details);
        console.log('RPC Hint:', rpcError.hint);
    } else {
        console.log('RPC Success:', JSON.stringify(rpcResult, null, 2));
    }

    // --- Check Cache Table ---
    console.log('\n--- Checking metrics_cache Table ---');
    const { data: cacheItems } = await supabase.from('metrics_cache').select('*');
    cacheItems?.forEach(item => {
        console.log(`Key: ${item.key}`);
        console.log(`Value: ${JSON.stringify(item.value, null, 2)}`);
    });
}

verify();
