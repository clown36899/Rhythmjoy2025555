
import { createClient } from '@supabase/supabase-js';

// USING SERVICE KEY TO BYPASS RLS
const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeDepeer() {
    console.log('--- 🕵️ Data Detective Mode On ---');
    const startDate = '2026-01-01T00:00:00+09:00';
    const endDate = '2026-01-31T23:59:59+09:00';

    let allLogs: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // 1. Fetch All Logs
    console.log('Fetching logs...');
    while (hasMore) {
        const { data: logs, error } = await supabase
            .from('site_analytics_logs')
            .select('created_at, target_type, target_title, session_id')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) { console.error(error); break; }
        if (logs && logs.length > 0) {
            allLogs = [...allLogs, ...logs];
            if (logs.length < pageSize) hasMore = false; else page++;
        } else { hasMore = false; }
        if (page > 50) break;
    }
    console.log(`Total Logs: ${allLogs.length}`);

    // 2. Hypothesis A: "The Omni-Dancer" (Cross-Interest)
    // How many sessions clicked BOTH 'class' and 'event'?
    const sessionMap = new Map<string, Set<string>>();
    allLogs.forEach(l => {
        if (!l.session_id) return;
        if (!sessionMap.has(l.session_id)) sessionMap.set(l.session_id, new Set());

        const type = l.target_type;
        const title = (l.target_title || '').toLowerCase();

        if (type === 'class' || title.includes('강습')) sessionMap.get(l.session_id)!.add('class');
        if (type === 'event' || title.includes('파티')) sessionMap.get(l.session_id)!.add('event');
    });

    let classOnly = 0;
    let eventOnly = 0;
    let both = 0;

    sessionMap.forEach(types => {
        if (types.has('class') && types.has('event')) both++;
        else if (types.has('class')) classOnly++;
        else if (types.has('event')) eventOnly++;
    });

    const totalActiveSessions = classOnly + eventOnly + both;
    console.log(`\n[Insight 1] User Interest Overlap (N=${totalActiveSessions} sessions)`);
    console.log(`- Only Class: ${classOnly} (${Math.round(classOnly / totalActiveSessions * 100)}%) -> "Studious Type"`);
    console.log(`- Only Event: ${eventOnly} (${Math.round(eventOnly / totalActiveSessions * 100)}%) -> "Party Type"`);
    console.log(`- Both: ${both} (${Math.round(both / totalActiveSessions * 100)}%) -> "Heavy User"`);


    // 3. Hypothesis B: "Newbie Patterns"
    // Do 'Level 1/Beginner' classes get clicked at different times?
    const newbieKeywords = ['초급', '입문', '베이직', '루키', 'l1', 'lv.1', 'basic'];
    const newbieHours = Array(24).fill(0);
    const seniorHours = Array(24).fill(0);
    let newbieCount = 0;
    let seniorCount = 0;

    allLogs.forEach(l => {
        const title = (l.target_title || '').toLowerCase();
        const type = l.target_type;

        if (type === 'class' || title.includes('강습')) {
            const d = new Date(l.created_at);
            const kstD = new Date(d.getTime() + (9 * 60 * 60 * 1000));
            const h = kstD.getUTCHours();

            const isNewbie = newbieKeywords.some(k => title.includes(k));
            if (isNewbie) {
                newbieHours[h]++;
                newbieCount++;
            } else {
                seniorHours[h]++;
                seniorCount++;
            }
        }
    });

    console.log(`\n[Insight 2] Newbie (Lv.1) vs General Class Patterns`);
    console.log(`- Newbie Clicks: ${newbieCount}`);
    console.log(`- General Clicks: ${seniorCount}`);

    if (newbieCount > 0) {
        const maxNewbie = Math.max(...newbieHours);
        const peakNewbieHour = newbieHours.indexOf(maxNewbie);
        console.log(`- Newbie Peak: ${peakNewbieHour}시`);
    }

    const maxSenior = Math.max(...seniorHours);
    const peakSeniorHour = seniorHours.indexOf(maxSenior);
    console.log(`- Senior Peak: ${peakSeniorHour}시`);


    // 4. Hypothesis C: "After-Party Traffic"
    // Logs created between 23:00 ~ 04:00 on Fri/Sat nights (Sat/Sun early morning)
    let afterPartyLogs = 0;
    allLogs.forEach(l => {
        const d = new Date(l.created_at); // UTC
        const kstD = new Date(d.getTime() + (9 * 60 * 60 * 1000));
        const h = kstD.getUTCHours();
        const day = kstD.getDay(); // 0=Sun, 6=Sat

        // Fri Night (Sat early morning) or Sat Night (Sun early morning)
        // Fri Night = Sat 00~04 AM
        // Sat Night = Sun 00~04 AM
        // And also late night 23 PM on Fri/Sat
        const isWeekendNight = (day === 5 || day === 6); // Fri or Sat
        const isLateNight = (h >= 22 || h <= 3);

        if (isWeekendNight && isLateNight) {
            afterPartyLogs++;
        }
    });

    console.log(`\n[Insight 3] Weekend Night Owls (Fri/Sat 22:00 ~ 03:00)`);
    console.log(`- Log Count: ${afterPartyLogs}`);
}

analyzeDepeer();
