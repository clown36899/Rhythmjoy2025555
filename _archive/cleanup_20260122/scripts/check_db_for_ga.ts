import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCurrentViews() {
    const eventIds = [307, 304, 301, 310, 309];
    console.log('=== 현재 DB 조회수 확인 (이벤트/강습) ===');

    const { data: events, error } = await supabase
        .from('events')
        .select('id, title, category, views')
        .in('id', eventIds);

    if (error) {
        console.error('Error fetching events:', error);
    } else {
        events?.forEach(e => {
            console.log(`[${e.category}] ID: ${e.id}, Title: ${e.title}, Views: ${e.views}`);
        });
    }

    console.log('\n=== 현재 DB 조회수 확인 (게시판) ===');
    // 이미보이는 게시글 ID가 대략 76 등일 가능성 농후
    const { data: posts, error: postError } = await supabase
        .from('board_posts')
        .select('id, title, views')
        .limit(5); // 일단 샘플

    if (postError) {
        console.error('Error fetching posts:', postError);
    } else {
        posts?.forEach(p => {
            console.log(`[게시글] ID: ${p.id}, Title: ${p.title}, Views: ${p.views}`);
        });
    }
}

checkCurrentViews();
