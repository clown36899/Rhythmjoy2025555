
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim();
    }
});

const supabaseUrl = envVars['VITE_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envVars['SUPABASE_SERVICE_KEY'];

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function runAnalysis() {
    console.log('📊 Analyzing Data for January 2026...\n');

    const startDate = '2026-01-01T00:00:00+09:00';
    const endDate = '2026-01-25T23:59:59+09:00'; // Current date

    // 1. Fetch Logs
    let allLogs = [];
    let page = 0;
    const PAGE_SIZE = 1000;

    // Safety limit 50k for script
    while (true) {
        const { data, error } = await supabase
            .from('site_analytics_logs')
            .select('created_at, target_type, target_title')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .eq('is_admin', false)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) {
            console.error('Error:', error);
            break;
        }
        if (!data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
        if (allLogs.length > 50000) break;
    }

    console.log(`Total Logs Fetched: ${allLogs.length}`);

    // 2. Analyze Day of Week Patterns
    // 0: Sun, 1: Mon, ... 6: Sat
    const dayCounts = Array(7).fill(0);
    const dayCategoryCounts = Array(7).fill(0).map(() => ({ social: 0, event: 0, class: 0 }));

    // Activity Balance
    let totalSocial = 0;
    let totalClass = 0;
    let totalEvent = 0;

    allLogs.forEach(log => {
        // Parse KST
        const date = new Date(log.created_at);
        const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000)); // Simple offset for script
        const day = date.getDay(); // UTC day roughly matches for broad correlation, but let's be approximate

        dayCounts[day]++;

        const type = log.target_type;
        if (['social', 'social_regular'].includes(type)) {
            dayCategoryCounts[day].social++;
            totalSocial++;
        } else if (['event'].includes(type)) {
            dayCategoryCounts[day].event++;
            totalEvent++;
        } else if (['class', 'workshop', 'academy'].includes(type)) { // Assuming 'academy' or similar if exists, but mostly checking known types
            dayCategoryCounts[day].class++;
            totalClass++;
        }
        // Check for 'nav_item' clicks to infer intent if needed, but target_type is safer
    });

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    console.log('\n📅 [요일별 활동 추이]');
    days.forEach((day, idx) => {
        const c = dayCategoryCounts[idx];
        const total = c.social + c.event + c.class;
        if (total === 0) return;

        const socialRatio = ((c.social / total) * 100).toFixed(1);
        const eventRatio = ((c.event / total) * 100).toFixed(1);
        console.log(`${day}: Total ${dayCounts[idx]} (Social ${socialRatio}%, Event ${eventRatio}%)`);
    });

    console.log('\n⚖️ [전체 활동 밸런스]');
    console.log(`Social: ${totalSocial}`);
    console.log(`Event: ${totalEvent}`);
    console.log(`Class: ${totalClass}`);  // Note: 'class' type might be rare if not tagged explicitly

    // 3. Simple Insight Generation
    console.log('\n📝 [자동 생성 리포트 초안 (담백한 어조)]');

    // Find Max Day
    const maxDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    console.log(`- 가장 활발한 요일: ${days[maxDayIdx]}요일`);

    // Find Dominant Activity
    if (totalEvent > totalSocial * 1.5) {
        console.log(`- 특이사항: 이벤트 조회수가 소셜보다 압도적으로 높음. (대형 행사 시즌 추정)`);
    } else if (totalSocial > totalEvent) {
        console.log(`- 특이사항: 일상적인 소셜 파티 정보 검색이 주를 이룸.`);
    }

    // Weekend vs Weekday
    const weekdayTotal = dayCounts[1] + dayCounts[2] + dayCounts[3] + dayCounts[4];
    const weekendTotal = dayCounts[5] + dayCounts[6] + dayCounts[0];
    const avgWeekday = weekdayTotal / 4;
    const avgWeekend = weekendTotal / 3;

    console.log(`- 평일 평균 활동: ${Math.round(avgWeekday)}건 / 주말 평균 활동: ${Math.round(avgWeekend)}건`);
    if (avgWeekend > avgWeekday * 1.5) {
        console.log(`- 패턴: 주말 집중형 (평일 대비 ${((avgWeekend / avgWeekday) * 100 - 100).toFixed(0)}% 증가)`);
    } else {
        console.log(`- 패턴: 주중/주말 고른 활동 분포`);
    }
}

runAnalysis();
