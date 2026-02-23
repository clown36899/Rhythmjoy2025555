import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyUpdates() {
    const targets = [
        'D&F 신년 라이브 파티',
        '🥳신규 거점지 오픈 파티 안내🥳',
        'DEEP DIVE',
        '2026 Street Lindy Fighter'
    ];

    console.log('--- Verification Start ---');
    for (const title of targets) {
        const { data, error } = await supabase
            .from('events')
            .select('id, title, views')
            .eq('title', title);

        if (error) console.error(`Error fetching ${title}:`, error);
        else {
            data?.forEach(e => {
                console.log(`[Events] '${e.title}' (ID: ${e.id}) -> Views in DB: ${e.views}`);
            });
        }
    }
}

verifyUpdates();
