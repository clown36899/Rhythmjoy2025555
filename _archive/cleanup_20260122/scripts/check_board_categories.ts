import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

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
