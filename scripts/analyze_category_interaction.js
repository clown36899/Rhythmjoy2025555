
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
    console.log('📊 Analyzing Category Interactions (Day-of-Week Patterns)...\n');

    // Fetch Events from Dec 2025 to Jan 2026 for broader sample
    const { data: events, error } = await supabase
        .from('events')
        .select('title, start_date, category')
        .gte('start_date', '2025-12-01')
        .lte('start_date', '2026-01-31');

    if (error) {
        console.error('Error:', error);
        return;
    }

    // Stats buckets
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const stats = days.map(day => ({
        day: day,
        classStart: 0,
        eventStart: 0,
        socialRegular: 0
    }));

    events.forEach(e => {
        if (!e.start_date) return;
        const d = new Date(e.start_date);
        const dayIdx = d.getDay();
        const cat = (e.category || '').toLowerCase();
        const title = (e.title || '').toLowerCase();

        // Categorize
        if (cat.includes('class') || cat.includes('academy') || title.includes('강습') || title.includes('모집') || title.includes('개강')) {
            stats[dayIdx].classStart++;
        } else if (cat.includes('social') || title.includes('소셜') || title.includes('해피') || title.includes('빠')) {
            // Distinguish Regular Social vs Special Event?
            // Usually 'event' table has Special Events. Regulars are in social_schedules or repeated.
            // Let's assume these are special events or one-offs if in 'events' table
            stats[dayIdx].eventStart++;
        } else {
            // Fallback: assume event if not class
            stats[dayIdx].eventStart++;
        }
    });

    console.log('📅 [요일별 시작(Start) 패턴]');
    console.log('Day | Class Starts | Event/Social Starts');
    console.log('----|--------------|---------------------');

    let totalClasses = 0;
    let totalEvents = 0;

    stats.forEach(s => {
        console.log(`${s.day.padEnd(3)} | ${s.classStart.toString().padEnd(12)} | ${s.eventStart}`);
        totalClasses += s.classStart;
        totalEvents += s.eventStart;
    });

    console.log('\n📝 [상세 패턴 분석]');

    // 1. Class Concentrate
    const monTueClass = stats[1].classStart + stats[2].classStart; // Mon+Tue
    const monTueRatio = ((monTueClass / totalClasses) * 100).toFixed(0);
    console.log(`- 강습 시작일: 월/화요일 비중 ${monTueRatio}% (주초 집중)`);

    // 2. Event Concentrate
    const friSatSunEvent = stats[5].eventStart + stats[6].eventStart + stats[0].eventStart; // Fri+Sat+Sun
    const weekendRatio = ((friSatSunEvent / totalEvents) * 100).toFixed(0);
    console.log(`- 행사/소셜일: 금/토/일요일 비중 ${weekendRatio}% (주말 집중)`);

    // 3. Interaction / Conflict
    // Analyze specific conflicts
    const conflictDays = stats.filter(s => s.classStart > 0 && s.eventStart > 0);
    if (conflictDays.length > 0) {
        console.log(`- 경합 요일: ${conflictDays.map(s => s.day).join(', ')}에 강습과 행사가 겹침.`);
        conflictDays.forEach(s => {
            if (s.classStart > s.eventStart * 2) console.log(`  => ${s.day}요일은 강습이 지배적 (행사 효과 반감 우려)`);
            else if (s.eventStart > s.classStart * 2) console.log(`  => ${s.day}요일은 행사가 지배적 (강습 주목도 하락 우려)`);
            else console.log(`  => ${s.day}요일은 치열한 경쟁 중`);
        });
    } else {
        console.log('- 요일별 역할 분담이 확실하여 직접적인 경합이 적음.');
    }
}

runAnalysis();
