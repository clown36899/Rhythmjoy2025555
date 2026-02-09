
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

async function checkPrefixes() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('Fetching prefixes for category "free"...');

    const { data, error } = await supabase
        .from('board_prefixes')
        .select('id, name, category')
        .eq('category', 'free');

    if (error) {
        console.error('❌ Failed to fetch prefixes:', error);
    } else {
        console.log(`✅ Found ${data.length} prefixes:`);
        console.table(data);

        const target = data.find(p => p.name.trim() === '전광판');
        if (target) {
            console.log(`🎯 Found "전광판": ID=${target.id}`);
        } else {
            console.log('⚠️ "전광판" prefix NOT found in "free" category.');
        }
    }
}

checkPrefixes();
