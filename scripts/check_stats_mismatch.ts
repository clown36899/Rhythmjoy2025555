
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStats() {
    console.log('--- Checking Stats Discrepancy ---');

    // 1. Call RPC (Current Logic results)
    console.log('1. Calling refresh_site_metrics RPC...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('refresh_site_metrics');

    if (rpcError) {
        console.error('RPC Failed:', rpcError);
    } else {
        console.log('RPC Result (SideDrawer Logic):');
        console.log(`- Event Total: ${rpcData.eventCountTotal}`);
        console.log(`- Breakdown: `, rpcData.eventBreakdown);
    }

    // 2. Count Raw Events (All Time)
    const { count: countAll, error: errAll } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .not('category', 'in', '("notice","notice_popup","board")'); // Matches RPC exclusion

    console.log(`2. Raw DB Count (All Time): ${countAll} (Error: ${errAll?.message || 'None'})`);

    // 3. Count Raw Events (Last 12 Months) - SwingSceneStats Logic
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { count: count1y, error: err1y } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .not('category', 'in', '("notice","notice_popup","board")')
        .or(`created_at.gte.${oneYearAgo.toISOString()},start_date.gte.${oneYearAgo.toISOString()},date.gte.${oneYearAgo.toISOString()},day_of_week.not.is.null`);

    console.log(`3. Raw DB Count (Last 1 Year + Recurring): ${count1y} (Error: ${err1y?.message || 'None'})`);

    console.log('----------------------------------');
    console.log('Conclusion:');
    if (rpcData && Math.abs(rpcData.eventCountTotal - countAll!) < 50) {
        console.log('-> RPC matches "All Time" count (Approx).');
    }
    if (rpcData && Math.abs(rpcData.eventCountTotal - count1y!) < 50) {
        console.log('-> RPC matches "1 Year" count (Approx).');
    }
}

checkStats();
