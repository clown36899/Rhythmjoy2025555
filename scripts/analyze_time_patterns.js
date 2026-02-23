
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
    console.log('📊 Analyzing Hourly Traffic Patterns (Time of Day)...\n');

    const startDate = '2026-01-01T00:00:00+09:00';
    const endDate = '2026-01-25T23:59:59+09:00';

    // Fetch Logs
    let allLogs = [];
    let page = 0;
    const PAGE_SIZE = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('site_analytics_logs')
            .select('created_at, target_type, target_title')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error || !data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
        if (allLogs.length > 50000) break;
    }

    console.log(`Analyzed ${allLogs.length} logs for hourly patterns...`);

    // Buckets: 0-23
    const hours = Array(24).fill(0);
    const categoryHours = Array(24).fill(0).map(() => ({ class: 0, event: 0, social: 0 }));

    allLogs.forEach(log => {
        const date = new Date(log.created_at);
        const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        const hour = kstDate.getUTCHours();

        hours[hour]++;

        const type = log.target_type;
        const title = (log.target_title || '').toLowerCase();

        if (type === 'event' || title.includes('파티') || title.includes('소셜')) {
            // Try to distinguish Class vs Event if possible based on title cues if type is generic
            if (title.includes('강습') || title.includes('모집') || title.includes('워크샵')) {
                categoryHours[hour].class++;
            } else {
                categoryHours[hour].event++;
            }
        } else if (type === 'class') {
            categoryHours[hour].class++;
        } else if (type === 'social') {
            categoryHours[hour].social++;
        }
    });

    // Formatting Output for Charting mentally
    console.log('\n⏰ [시간대별 접속량 (Hourly Traffic)]');
    console.log('Hour | Total | Class | Event');
    console.log('-----|-------|-------|------');

    // Find Peaks
    let maxHour = 0;
    let maxCount = 0;

    hours.forEach((count, h) => {
        const bar = '#'.repeat(Math.ceil(count / 50));
        if (count > maxCount) {
            maxCount = count;
            maxHour = h;
        }
        // Print condensed view
        if (count > 0) {
            console.log(`${h.toString().padStart(2, '0')}시 | ${count.toString().padStart(4)} | ${categoryHours[h].class.toString().padEnd(5)} | ${categoryHours[h].event}`);
        }
    });

    console.log('\n📝 [시간대 분석]');
    console.log(`- Peak Time: ${maxHour}시 (가장 활동이 활발한 시간)`);

    // Day vs Night
    const morning = hours.slice(6, 12).reduce((a, b) => a + b, 0);
    const afternoon = hours.slice(12, 18).reduce((a, b) => a + b, 0);
    const evening = hours.slice(18, 24).reduce((a, b) => a + b, 0);
    const night = hours.slice(0, 6).reduce((a, b) => a + b, 0);

    console.log(`- Morning (06-12): ${morning}`);
    console.log(`- Afternoon (12-18): ${afternoon}`);
    console.log(`- Evening (18-24): ${evening}`);
    console.log(`- Late Night (00-06): ${night}`);

    // Interaction Insight
    // When do people check Classes vs Events?
    const classPeak = categoryHours.findIndex((h, i) => h.class === Math.max(...categoryHours.map(x => x.class)));
    const eventPeak = categoryHours.findIndex((h, i) => h.event === Math.max(...categoryHours.map(x => x.event)));

    console.log(`- 강습 확인 피크: ${classPeak}시`);
    console.log(`- 행사 확인 피크: ${eventPeak}시`);

    if (Math.abs(classPeak - eventPeak) > 3) {
        console.log(`-> 패턴 분리됨: 강습은 ${classPeak}시, 행사는 ${eventPeak}시에 주로 확인.`);
    } else {
        console.log(`-> 패턴 유사함: 주로 ${eventPeak}시 경에 모든 정보를 몰아서 확인.`);
    }

}

runAnalysis();
