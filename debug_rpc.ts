import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugRPC() {
    console.log('=== Debugging RPC Function ===\n');

    // Test direct INSERT into board_post_views
    console.log('[1] Testing DIRECT INSERT into board_post_views...');
    const testUserId = 'test-user-' + Date.now();
    const testPostId = 76;

    try {
        const { data, error } = await supabase
            .from('board_post_views')
            .insert({
                user_id: testUserId,
                fingerprint: null,
                post_id: testPostId
            })
            .select();

        if (error) {
            console.error('   ❌ Direct INSERT failed:', error.message);
            console.error('   Error code:', error.code);
            console.error('   Details:', error.details);
        } else {
            console.log('   ✅ Direct INSERT succeeded');
            console.log('   Inserted record:', data);
        }
    } catch (e: any) {
        console.error('   ❌ Exception:', e.message);
    }

    // Now test RPC with same data
    console.log('\n[2] Testing RPC with same user/post...');
    const { data: rpcResult, error: rpcError } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: testUserId,
        p_fingerprint: null
    });

    if (rpcError) {
        console.error('   ❌ RPC Error:', rpcError.message);
    } else {
        console.log(`   RPC returned: ${rpcResult}`);
    }

    // Check if view count increased
    const { data: post } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Post ${testPostId} views: ${post?.views}`);

    console.log('\n=== Debug Complete ===');
}

debugRPC();
