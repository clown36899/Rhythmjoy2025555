
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
    console.log('📊 Analyzing Event Lead Time & Engagement Impact (Log-based)...\n');

    // 1. Fetch Events
    const { data: events, error } = await supabase
        .from('events')
        .select('id, title, created_at, start_date')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.error('Error fetching events:', error);
        return;
    }

    // 2. Aggregate Views from Logs (Client-side join roughly)
    // Fetch logs for 'event' type
    // Note: In real app, we might want to do this via RPC, but for script we do bulk fetch
    let viewMap = new Map(); // eventId -> count

    // Fetch logs efficiently? 
    // We can't fetch all logs forever. Let's limit to logs created after the oldest event in our list.
    const oldestEvent = events[events.length - 1];
    const startDate = oldestEvent.created_at;

    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data: logs, error: lError } = await supabase
            .from('site_analytics_logs')
            .select('target_id')
            .eq('target_type', 'event')
            .gte('created_at', startDate)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (lError) break;
        if (!logs || logs.length === 0) break;

        logs.forEach(l => {
            const current = viewMap.get(l.target_id) || 0;
            viewMap.set(l.target_id, current + 1);
        });

        if (logs.length < PAGE_SIZE) break;
        page++;
        if (page > 50) break; // Safety
    }

    console.log(`Analyzed logs for ${events.length} events...`);

    let leadTimeStats = [];
    let leadTimeCorrelation = [];

    events.forEach(event => {
        if (!event.start_date) return;
        const created = new Date(event.created_at);
        const start = new Date(event.start_date);

        const diffTime = start.getTime() - created.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const views = viewMap.get(event.id.toString()) || 0;

        if (diffDays > -30 && diffDays < 180) {
            leadTimeStats.push(diffDays);
            leadTimeCorrelation.push({ days: diffDays, views: views, title: event.title });
        }
    });

    const groups = {
        short: { count: 0, views: 0, label: '급박 (1주 미만)' },
        medium: { count: 0, views: 0, label: '보통 (1-2주)' },
        long: { count: 0, views: 0, label: '여유 (2-4주)' },
        early: { count: 0, views: 0, label: '얼리버드 (1달 이상)' }
    };

    leadTimeCorrelation.forEach(item => {
        if (item.days < 7) {
            groups.short.count++;
            groups.short.views += item.views;
        } else if (item.days < 14) {
            groups.medium.count++;
            groups.medium.views += item.views;
        } else if (item.days < 30) {
            groups.long.count++;
            groups.long.views += item.views;
        } else {
            groups.early.count++;
            groups.early.views += item.views;
        }
    });

    console.log('\n📈 [리드타임별 평균 조회수 영향]');
    Object.keys(groups).forEach(key => {
        const g = groups[key];
        const avg = g.count > 0 ? (g.views / g.count).toFixed(0) : 0;
        console.log(`${g.label}: ${g.count}건 등록 -> 평균 조회수 ${avg}`);
    });

    const earlyAvg = groups.early.count > 0 ? groups.early.views / groups.early.count : 0;
    const shortAvg = groups.short.count > 0 ? groups.short.views / groups.short.count : 0;

    console.log('\n📝 [분석 결과]');
    if (earlyAvg > shortAvg) {
        const multiplier = (earlyAvg / Math.max(shortAvg, 1)).toFixed(1);
        console.log(`- Insight: 일찍 등록한 행사(1달 전)가 급하게 등록한 행사보다 평균 ${multiplier}배 더 많이 조회됨.`);
    } else {
        console.log(`- Insight: 등록 시점과 조회수 간의 뚜렷한 정비례 관계는 보이지 않음.`);
    }
}

runAnalysis();
