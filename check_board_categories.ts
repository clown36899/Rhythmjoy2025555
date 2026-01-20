import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBoardCategories() {
    console.log('=== 게시판 카테고리 확인 ===\n');

    const { data: categories, error } = await supabase
        .from('board_categories')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        console.error('❌ 에러:', error.message);
        return;
    }

    console.log('발견된 카테고리:');
    categories?.forEach((cat, i) => {
        console.log(`${i + 1}. code: "${cat.code}", name: "${cat.name}", order: ${cat.display_order}`);
    });

    console.log('\n=== 확인 완료 ===');
}

checkBoardCategories();
