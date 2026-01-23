
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function run() {
    console.log('--- Analyzing Events (Classes) ---');
    const { data: events, error: activeError } = await supabase
        .from('events')
        .select('title, date, event_dates, created_at')
        .eq('category', 'class')
        .order('created_at', { ascending: false })
        .limit(20);

    if (activeError) console.error(activeError);
    else {
        events.forEach(e => {
            const dateSources = [];
            if (e.event_dates && e.event_dates.length) dateSources.push(...e.event_dates);
            else if (e.date) dateSources.push(e.date);

            const days = dateSources.map(d => {
                const date = new Date(d);
                return `${d} (${dayNames[date.getDay()]})`;
            });
            console.log(`[${e.title}] Sources: ${days.join(', ')} (Created: ${e.created_at})`);
        });
    }

    console.log('\n--- Analyzing Socials ---');
    const { data: socials, error: socialError } = await supabase
        .from('social_schedules')
        .select('title, day_of_week, date, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    if (socialError) console.error(socialError);
    else {
        socials.forEach(s => {
            let dayInfo = '';
            if (s.day_of_week !== null) {
                dayInfo = `Recurring: ${s.day_of_week} -> ${dayNames[Number(s.day_of_week) % 7]}`;
            } else if (s.date) {
                const d = new Date(s.date);
                dayInfo = `One-time: ${s.date} -> ${dayNames[d.getDay()]}`;
            } else {
                dayInfo = 'No Date Info';
            }
            console.log(`[${s.title}] ${dayInfo}`);
        });
    }
}

run();
