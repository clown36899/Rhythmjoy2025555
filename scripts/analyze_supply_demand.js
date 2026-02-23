
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
    console.log('📊 Analyzing Weekly Rhythm: Supply (Schedule) vs Demand (Clicks)...\n');

    // 1. Demand Analysis (When do people CLICK?)
    // We already know from previous script: Wednesday Peak, Event heavy.
    // Let's re-use the "Click Day Distribution" concept but this time filter by category clearly.

    // 2. Supply Analysis (When do events HAPPEN?)
    // Fetch all events active in Jan 2026
    const startDate = '2026-01-01';
    const endDate = '2026-01-31';

    const { data: events, error } = await supabase
        .from('events')
        .select('id, title, start_date, category')
        .gte('start_date', startDate)
        .lte('start_date', endDate);

    if (error) {
        console.error('Error fetching supply:', error);
        return;
    }

    // Bucket Supply by Day of Week (0=Sun)
    const supplyStats = Array(7).fill(0).map(() => ({ class: 0, social: 0, event: 0 }));

    events.forEach(e => {
        const d = new Date(e.start_date);
        const day = d.getDay();
        const cat = (e.category || '').toLowerCase();

        let type = 'event'; // Default
        if (cat.includes('class') || cat.includes('academy') || e.title.includes('강습') || e.title.includes('모집')) {
            type = 'class';
        } else if (cat.includes('social') || e.title.includes('소셜') || e.title.includes('빠')) {
            type = 'social';
        }

        supplyStats[day][type]++;
    });

    const days = ['일', '월', '화', '수', '목', '금', '토'];

    console.log('📅 [공급 분포: 실제 행사가 열리는 요일]');
    console.log('Day | Class | Social | Event | Dominant');
    console.log('----|-------|--------|-------|---------');

    supplyStats.forEach((s, i) => {
        const total = s.class + s.social + s.event;
        const dominant = total === 0 ? '-' :
            (s.class > s.social + s.event) ? 'Class' :
                (s.social > s.class + s.event) ? 'Social' : 'Mixed';

        console.log(`${days[i]}  | ${s.class.toString().padEnd(5)} | ${s.social.toString().padEnd(6)} | ${s.event.toString().padEnd(5)} | ${dominant}`);
    });

    // 3. Correlation Logic (Inferred)
    console.log('\n🔄 [스윙 라이프사이클 분석]');

    // Check Weekday Class Concentration
    const weekdayClass = supplyStats[1].class + supplyStats[2].class + supplyStats[3].class + supplyStats[4].class;
    const weekendClass = supplyStats[5].class + supplyStats[6].class + supplyStats[0].class;

    // Check Weekend Social Concentration
    const weekdaySocial = supplyStats[1].social + supplyStats[2].social + supplyStats[3].social + supplyStats[4].social;
    const weekendSocial = supplyStats[5].social + supplyStats[6].social + supplyStats[0].social;

    console.log(`- 강습: 평일 ${weekdayClass}건 vs 주말 ${weekendClass}건`);
    console.log(`- 소셜/행사: 평일 ${weekdaySocial}건 vs 주말 ${weekendSocial}건`);

    if (weekdayClass > weekendClass && weekendSocial > weekdaySocial) {
        console.log('✅ 확인됨: "평일은 강습, 주말은 소셜"의 명확한 역할 분담.');
        console.log('   (서로의 영역을 침범하지 않고 균형을 유지함)');
    } else {
        console.log('❓ 특이패턴: 강습과 소셜의 요일 경계가 모호함.');
    }
}

runAnalysis();
