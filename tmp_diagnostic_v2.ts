
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnosticV2() {
    console.log('--- Diagnostic V2 (Mirroring Function Logic) ---')

    const getKSTDate = (date: Date) => {
        return new Date(date.getTime() + (9 * 60 * 60 * 1000));
    };
    const kstNow = getKSTDate(new Date());
    const kstTodayStr = kstNow.toISOString().split('T')[0];
    const kstMonthStr = kstTodayStr.substring(0, 7);
    const kstDayOfMonth = kstNow.getUTCDate();

    console.log(`KST Today Str: ${kstTodayStr}`);
    console.log(`KST Month Str: ${kstMonthStr}`);
    console.log(`KST Day of Month: ${kstDayOfMonth}`);
    console.log(`KST Year: ${kstNow.getUTCFullYear()}, KST Month: ${kstNow.getUTCMonth() + 1}`);

    const { data: eventMetrics } = await supabase
        .from('site_stats_index')
        .select('metric_type, ref_date, val')
        .in('metric_type', ['act_count', 'reg_count'])
        .gte('ref_date', '2026-03-01')
        .lte('ref_date', '2026-03-31');

    const monthlyMap: any = {};

    eventMetrics?.forEach(row => {
        const month = row.ref_date.substring(0, 7);
        const val = Number(row.val);

        if (row.metric_type === 'act_count') {
            if (!monthlyMap[month]) {
                monthlyMap[month] = { month, total: 0, totalUntilToday: 0 };
            }
            monthlyMap[month].total += val;
            if (row.ref_date <= kstTodayStr) {
                monthlyMap[month].totalUntilToday += val;
            } else {
                // console.log(`Future: ${row.ref_date} (${val})`);
            }
        }
    });

    const monthly = Object.values(monthlyMap).map((m: any) => {
        const [year, monthNum] = m.month.split('-').map(Number);
        const isCurrentMonth = year === (kstNow.getUTCFullYear()) && monthNum === (kstNow.getUTCMonth() + 1);
        const daysInMonth = isCurrentMonth ? kstDayOfMonth : new Date(year, monthNum, 0).getDate();
        const totalForAvg = isCurrentMonth ? m.totalUntilToday : m.total;
        const dailyAvg = Number((totalForAvg / (daysInMonth || 1)).toFixed(1));

        console.log(`Month: ${m.month}`);
        console.log(`  isCurrentMonth: ${isCurrentMonth}`);
        console.log(`  total: ${m.total}`);
        console.log(`  totalUntilToday: ${m.totalUntilToday}`);
        console.log(`  daysInMonth (used): ${daysInMonth}`);
        console.log(`  dailyAvg: ${dailyAvg}`);

        return { ...m, dailyAvg };
    });

    const currentMonthData: any = monthlyMap[kstMonthStr];
    if (currentMonthData) {
        const dailyAverageSummary = Number((currentMonthData.totalUntilToday / kstDayOfMonth).toFixed(1));
        console.log(`\nSummary dailyAverage: ${dailyAverageSummary}`);
    }
}

diagnosticV2()
