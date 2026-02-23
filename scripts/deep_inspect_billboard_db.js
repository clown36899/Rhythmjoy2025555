
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectDB() {
    console.log('🔍 [1] Inspecting site_analytics_logs schema & sample...');
    const { data: cols, error: cErr } = await supabase.rpc('get_table_columns', { table_name: 'site_analytics_logs' });
    if (cErr) {
        console.log('RPC get_table_columns failed, trying direct query on some rows...');
        const { data: sample, error: sErr } = await supabase.from('site_analytics_logs').select('*').limit(1);
        if (sErr) console.error('Sample fetch failed:', sErr);
        else console.log('Sample Keys:', Object.keys(sample[0] || {}));
    } else {
        console.log('Columns:', cols);
    }

    console.log('\n📊 [2] Full Target Type Distribution (Jan 2026)...');
    let allDist = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('site_analytics_logs')
            .select('target_type')
            .gte('created_at', '2026-01-01')
            .lte('created_at', '2026-01-31')
            .range(from, from + 999);
        if (error || !data || data.length === 0) break;
        allDist = allDist.concat(data);
        if (data.length < 1000) break;
        from += 1000;
    }

    if (allDist.length > 0) {
        const counts = {};
        allDist.forEach(r => counts[r.target_type] = (counts[r.target_type] || 0) + 1);
        console.log('Total Logs Found:', allDist.length);
        console.log('Distribution:', counts);
    }

    console.log('\n📅 [3] Jan 2026 Data Range Info...');
    const { count: logCount } = await supabase.from('site_analytics_logs').select('*', { count: 'exact', head: true })
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-01-31');
    console.log('Total Logs (Jan 2026):', logCount);

    const { data: evs, error: evErr } = await supabase
        .from('events')
        .select('id, title, start_date')
        .gte('start_date', '2026-01-01')
        .lte('start_date', '2026-01-31');

    console.log('Total Events found in Range:', evs?.length || 0);
    if (evs && evs.length > 0) {
        console.log('Sample Event:', evs[0]);
    }

    console.log('\n👤 [4] Admin vs User...');
    let adminCount = 0;
    let userCount = 0;
    allDist.forEach(r => {
        // We need to fetch is_admin too, so let's modify the select in the loop above or do a separate count
    });

    const { count: totalAdmin, error: aErr } = await supabase
        .from('site_analytics_logs')
        .select('*', { count: 'exact', head: true })
        .eq('is_admin', true)
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-01-31');

    const { count: totalUser, error: uErr } = await supabase
        .from('site_analytics_logs')
        .select('*', { count: 'exact', head: true })
        .eq('is_admin', false)
        .gte('created_at', '2026-01-01')
        .lte('created_at', '2026-01-31');

    console.log('Admin Logs:', totalAdmin);
    console.log('Regular User Logs:', totalUser);

    console.log('\n🔐 [5] Auth Role Check...');
    const { data: who, error: wErr } = await supabase.auth.getUser();
    console.log('Client Role:', who?.user?.role || 'anon');
}

inspectDB();
