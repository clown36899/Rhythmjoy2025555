
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
    console.log('📊 Analyzing Optimal Promotion Window (Granular)...\n');

    // 1. Fetch Events & Categories
    const { data: events, error } = await supabase
        .from('events')
        .select('id, title, created_at, start_date, category')
        .order('created_at', { ascending: false })
        .limit(300); // Larger sample

    if (error) {
        console.error('Error fetching events:', error);
        return;
    }

    // 2. Aggregate Views
    const oldestEvent = events[events.length - 1];
    const startDate = oldestEvent.created_at;
    let viewMap = new Map();

    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data: logs, error: lError } = await supabase
            .from('site_analytics_logs')
            .select('target_id')
            .eq('target_type', 'event')
            .gte('created_at', startDate)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (lError || !logs || logs.length === 0) break;
        logs.forEach(l => viewMap.set(l.target_id, (viewMap.get(l.target_id) || 0) + 1));
        if (logs.length < PAGE_SIZE) break;
        page++;
        if (page > 100) break;
    }

    console.log(`Analyzed logs for ${events.length} events...`);

    // 3. Granular Buckets
    // Weeks: 1, 2, 3, 4, 5-6, 7-8, 9+
    const buckets = [
        { min: 0, max: 7, label: '1주 미만', stats: { count: 0, views: 0 } },
        { min: 8, max: 14, label: '2주', stats: { count: 0, views: 0 } },
        { min: 15, max: 21, label: '3주', stats: { count: 0, views: 0 } },
        { min: 22, max: 28, label: '4주', stats: { count: 0, views: 0 } },
        { min: 29, max: 42, label: '5~6주', stats: { count: 0, views: 0 } },
        { min: 43, max: 56, label: '7~8주', stats: { count: 0, views: 0 } },
        { min: 57, max: 999, label: '2달 이상', stats: { count: 0, views: 0 } },
    ];

    // Category Splits: Class vs Event
    const catStats = {
        class: JSON.parse(JSON.stringify(buckets)), // Deep copy structure
        event: JSON.parse(JSON.stringify(buckets))
    };

    events.forEach(event => {
        if (!event.start_date) return;
        const created = new Date(event.created_at);
        const start = new Date(event.start_date);
        const diffDays = Math.ceil((start.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        const views = viewMap.get(event.id.toString()) || 0;

        if (diffDays < 0 || diffDays > 180) return;

        // Determine bucket
        const bucketIndex = buckets.findIndex(b => diffDays >= b.min && diffDays <= b.max);
        if (bucketIndex === -1) return;

        // Identify Type (Broad approximation)
        let targetGroup = 'event'; // default
        const title = (event.title || '').toLowerCase();
        const cat = (event.category || '').toLowerCase();

        if (cat.includes('class') || cat.includes('academy') || title.includes('강습') || title.includes('워크샵') || title.includes('모집')) {
            targetGroup = 'class';
        }

        const bucketList = targetGroup === 'class' ? catStats.class : catStats.event;
        bucketList[bucketIndex].stats.count++;
        bucketList[bucketIndex].stats.views += views;
    });

    console.log('\n📅 [강습(Class) 홍보 기간별 효율]');
    let maxClass = { val: 0, label: '' };
    catStats.class.forEach(b => {
        const avg = b.stats.count > 0 ? (b.stats.views / b.stats.count).toFixed(1) : '0';
        if (Number(avg) > maxClass.val) maxClass = { val: Number(avg), label: b.label };
        console.log(`${b.label.padEnd(7)}: ${b.stats.count}건 -> 평균 ${avg}회`);
    });

    console.log('\n🎉 [소셜/행사(Event) 홍보 기간별 효율]');
    let maxEvent = { val: 0, label: '' };
    catStats.event.forEach(b => {
        const avg = b.stats.count > 0 ? (b.stats.views / b.stats.count).toFixed(1) : '0';
        if (Number(avg) > maxEvent.val) maxEvent = { val: Number(avg), label: b.label };
        console.log(`${b.label.padEnd(7)}: ${b.stats.count}건 -> 평균 ${avg}회`);
    });

    console.log('\n📝 [결론 도출]');
    console.log(`- 강습 최적 시기: ${maxClass.val > 0 ? maxClass.label : '데이터 부족'}`);
    console.log(`- 행사 최적 시기: ${maxEvent.val > 0 ? maxEvent.label : '데이터 부족'}`);
}

runAnalysis();
