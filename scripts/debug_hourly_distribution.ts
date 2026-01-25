
import { createClient } from '@supabase/supabase-js';

// Hardcoded for debugging context (from .env)
const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
// USING SERVICE KEY TO BYPASS RLS
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyze() {
    console.log('Fetching logs with SERVICE ROLE KEY...');
    const startDate = '2026-01-01T00:00:00+09:00';
    const endDate = '2026-01-31T23:59:59+09:00';

    // Fetch ALL logs (recursive)
    let allLogs: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data: logs, error } = await supabase
            .from('site_analytics_logs')
            .select('created_at, target_type, target_title')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Fetch error:', error);
            break;
        }

        if (logs && logs.length > 0) {
            allLogs = [...allLogs, ...logs];
            console.log(`Fetched page ${page}: ${logs.length} rows`);
            if (logs.length < pageSize) hasMore = false;
            else page++;
        } else {
            hasMore = false;
        }

        if (page > 50) break; // Safety
    }

    console.log(`\nTOTAL FETCHED: ${allLogs.length} logs.`);

    const hours = Array(24).fill(0).map((_, i) => ({ hour: i, class: 0, event: 0, visit: 0 }));

    allLogs.forEach(l => {
        const d = new Date(l.created_at);
        // KST Conversion Logic: UTC + 9
        const kstD = new Date(d.getTime() + (9 * 60 * 60 * 1000));
        const h = kstD.getUTCHours();

        // Debug first few rows
        if (Math.random() < 0.001) {
            console.log(`[Sample] Raw: ${l.created_at} -> KST Hour: ${h} (Type: ${l.target_type})`);
        }

        const type = l.target_type;
        const title = (l.target_title || '').toLowerCase();

        if (type === 'class' || title.includes('강습')) {
            hours[h].class++;
        }
        if (type === 'event' || title.includes('파티')) {
            hours[h].event++;
        }
    });

    console.log('\n=== HOURLY DISTRIBUTION (KST) ===');
    console.log('Hour\tClass\tEvent');

    hours.forEach(h => {
        console.log(`${h.hour}\t${h.class}\t${h.event}`);
    });
}

analyze();
