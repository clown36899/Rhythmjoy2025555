
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
    console.log('📊 Analyzing Weekly Rhythm V2 (Correct Tables)...\n');

    // 1. Class Supply (from events table)
    // Filter for categories/titles like 'class', 'academy'
    const { data: classes, error: cError } = await supabase
        .from('events')
        .select('start_date, title')
        .gte('start_date', '2026-01-01')
        .lte('start_date', '2026-01-31')
        .or('category.ilike.%class%,category.ilike.%academy%,title.ilike.%강습%,title.ilike.%개강%,title.ilike.%모집%');

    // 2. Social Supply (from social_schedules or social_events)
    // Note: social_schedules usually has 'day_of_week' (0-6) or specific dates.
    // Let's assume it's a recurring schedule + exceptions, but for monthly analysis we check active ones.
    // If 'social_schedules' is for recurring, we might need 'schedule_time' and 'day'.
    // Let's check data first.
    const { data: socials, error: sError } = await supabase
        .from('social_schedules')
        .select('*')
        .eq('is_active', true); // Assuming active socials

    // Count by Day
    const stats = Array(7).fill(0).map(() => ({ class: 0, social: 0 }));

    if (classes) {
        classes.forEach(c => {
            const day = new Date(c.start_date).getDay();
            stats[day].class++;
        });
    }

    if (socials) {
        socials.forEach(s => {
            // s.day_of_week might be string 'Mon' or number. Check schema via data.
            // Adjust based on observation.
            let day = -1;
            if (typeof s.day_of_week === 'number') day = s.day_of_week; // 0=Sun?
            else if (s.day_of_week === '월') day = 1;
            else if (s.day_of_week === '화') day = 2;
            else if (s.day_of_week === '수') day = 3;
            else if (s.day_of_week === '목') day = 4;
            else if (s.day_of_week === '금') day = 5;
            else if (s.day_of_week === '토') day = 6;
            else if (s.day_of_week === '일') day = 0;

            if (day >= 0) stats[day].social++;
        });
    }

    const days = ['일', '월', '화', '수', '목', '금', '토'];

    console.log('📅 [공급 분포: 요일별 강습 vs 소셜]');
    console.log('Day | Class (start) | Social (running)');
    console.log('----|---------------|------------------');

    stats.forEach((s, i) => {
        console.log(`${days[i]}  | ${s.class.toString().padEnd(13)} | ${s.social}`);
    });

    console.log('\n📝 [인사이트 추출]');
    const weekendSocial = stats[5].social + stats[6].social + stats[0].social;
    const weekdaySocial = stats[1].social + stats[2].social + stats[3].social + stats[4].social;
    const weekdayClass = stats[1].class + stats[2].class + stats[3].class + stats[4].class;

    if (weekendSocial > weekdaySocial * 2) {
        console.log("- 소셜: '주말(금-일) 집중형' 구조 확인됨.");
    }
    if (weekdayClass > 0) {
        console.log(`- 강습: 평일에 ${weekdayClass}건이 시작됨 (퇴근 후 강습 패턴).`);
    }

    // Trade-off Check
    // Max Social Day
    const maxSocialDayIdx = stats.findIndex(s => s.social === Math.max(...stats.map(x => x.social)));
    console.log(`- 소셜 최다 요일: ${days[maxSocialDayIdx]}요일 (${stats[maxSocialDayIdx].social}곳 오픈)`);
    console.log(`- 해당 요일 강습: ${stats[maxSocialDayIdx].class}건 (소셜 ${stats[maxSocialDayIdx].social} vs 강습 ${stats[maxSocialDayIdx].class})`);
}

runAnalysis();
