
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnostic() {
    console.log('--- Detailed Diagnostic for March 2026 ---')

    // Exact same KST logic as function
    const kstNow = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
    const kstTodayStr = kstNow.toISOString().split('T')[0];
    const kstDayOfMonth = kstNow.getUTCDate();
    console.log(`Diagnostic KST Today: ${kstTodayStr}, Day: ${kstDayOfMonth}`);

    const { data: rows } = await supabase
        .from('site_stats_index')
        .select('ref_date, val, metric_type')
        .eq('metric_type', 'act_count')
        .gte('ref_date', '2026-03-01')
        .lte('ref_date', '2026-03-31')

    if (!rows) {
        console.error('No data found');
        return;
    }

    console.log(`Total rows found for March: ${rows.length}`);

    let total = 0;
    let untilToday = 0;

    const breakdown: Record<string, number> = {};

    rows.forEach(row => {
        const val = Number(row.val);
        const date = row.ref_date;
        total += val;
        breakdown[date] = (breakdown[date] || 0) + val;

        if (date <= kstTodayStr) {
            untilToday += val;
        } else {
            // console.log(`[FUTURE] ${date}: ${val}`);
        }
    });

    console.log('\n--- Daily Breakdown ---');
    Object.keys(breakdown).sort().forEach(d => {
        console.log(`${d}: ${breakdown[d]} events`);
    });

    console.log('\n--- Summary ---');
    console.log(`Total for March: ${total}`);
    console.log(`Until Today (${kstTodayStr}): ${untilToday}`);
    console.log(`Calculated Daily Avg (New): ${untilToday} / ${kstDayOfMonth} = ${untilToday / kstDayOfMonth}`);
    console.log(`Calculated Daily Avg (Old): ${total} / ${kstDayOfMonth} = ${total / kstDayOfMonth}`);
}

diagnostic()
