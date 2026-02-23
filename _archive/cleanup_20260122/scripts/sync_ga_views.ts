import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GA4 데이터를 여기에 입력하세요.
 * path: GA4의 '페이지 경로'
 * views: GA4의 '조회수'
 */
const gaData = [
    { path: '/event/307', views: 1000 },
    { path: '/event/304', views: 650 },
    { path: '/class/310', views: 240 },
    { path: '/v2/board/post/78', views: 150 },
    // ... 추가 데이터 입력 가능
];

async function syncGAViews() {
    console.log('🚀 GA4 데이터 동기화 시작...\n');

    for (const item of gaData) {
        let table = '';
        let id = '';

        if (item.path.includes('/event/')) {
            table = 'events';
            id = item.path.split('/event/')[1].split('/')[0];
        } else if (item.path.includes('/class/')) {
            table = 'events';
            id = item.path.split('/class/')[1].split('/')[0];
        } else if (item.path.includes('/board/post/')) {
            table = 'board_posts';
            id = item.path.split('/board/post/')[1].split('/')[0];
        }

        if (table && id) {
            console.log(`[Processing] ${table} ID: ${id} -> GA Views: ${item.views}`);

            // GREATEST를 사용하여 현재 DB값보다 높을 때만 업데이트
            const { error } = await supabase.rpc('update_views_if_greater', {
                p_table_name: table,
                p_id: parseInt(id),
                p_ga_views: item.views
            });

            if (error) {
                // RPC가 없으면 일반 업데이트 시도
                console.log(`   ⚠️ RPC update_views_if_greater 가 없어서 일반 업데이트를 시도합니다.`);
                const { error: updateError } = await supabase
                    .from(table)
                    .update({ views: item.views }) // 실제로는 GREATEST 로직이 SQL로 필요함
                    .eq('id', id);

                if (updateError) console.error(`   ❌ Update Error:`, updateError.message);
                else console.log(`   ✅ Updated to ${item.views}`);
            } else {
                console.log(`   ✅ Synced via RPC (GREATEST applied)`);
            }
        }
    }

    console.log('\n✨ 동기화 완료!');
}

// 이 스크립트를 실행하기 전에 update_views_if_greater RPC를 DB에 생성하는 것이 좋습니다.
/*
CREATE OR REPLACE FUNCTION update_views_if_greater(p_table_name text, p_id int, p_ga_views int)
RETURNS void AS $$
BEGIN
  IF p_table_name = 'events' THEN
    UPDATE events SET views = GREATEST(views, p_ga_views) WHERE id = p_id;
  ELSIF p_table_name = 'board_posts' THEN
    UPDATE board_posts SET views = GREATEST(views, p_ga_views) WHERE id = p_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/

syncGAViews();
