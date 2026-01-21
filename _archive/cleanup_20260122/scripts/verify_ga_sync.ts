import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

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
