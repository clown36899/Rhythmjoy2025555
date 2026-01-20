import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyViewTracking() {
    console.log('=== Verifying User-Based View Tracking System ===\n');

    // 1. Check if board_post_views table exists
    console.log('[1] Checking if board_post_views table exists...');
    const { data: tableCheck, error: tableError } = await supabase
        .from('board_post_views')
        .select('*')
        .limit(1);

    if (tableError) {
        console.error('❌ Table does not exist or is not accessible:', tableError.message);
        return;
    }
    console.log('✅ Table exists and is accessible\n');

    // 2. Test RPC with logged-in user (simulated)
    const testUserId = '91b04b25-7449-4d64-8fc2-4e328b2659ab'; // From user's logs
    const testPostId = 76; // Known existing post

    console.log('[2] Testing RPC with logged-in user...');
    console.log(`   User ID: ${testUserId.substring(0, 8)}...`);
    console.log(`   Post ID: ${testPostId}`);

    // Get initial view count
    const { data: postBefore } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Initial views: ${postBefore?.views || 0}`);

    // First call - should increment
    const { data: result1, error: error1 } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: testUserId,
        p_fingerprint: null
    });

    if (error1) {
        console.error('❌ RPC Error:', error1);
        return;
    }

    console.log(`   First call result: ${result1 ? '✅ TRUE (incremented)' : '❌ FALSE (not incremented)'}`);

    // Check view count after first call
    const { data: postAfter1 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Views after 1st call: ${postAfter1?.views || 0}`);

    // Second call - should NOT increment (duplicate)
    const { data: result2, error: error2 } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: testUserId,
        p_fingerprint: null
    });

    console.log(`   Second call result: ${result2 ? '❌ TRUE (should be FALSE!)' : '✅ FALSE (duplicate prevented)'}`);

    // Check view count after second call
    const { data: postAfter2 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Views after 2nd call: ${postAfter2?.views || 0}`);

    // 3. Test RPC with anonymous user (fingerprint)
    console.log('\n[3] Testing RPC with anonymous user...');
    const testFingerprint = 'fp_test_' + Date.now();
    const testPostId2 = 78;

    console.log(`   Fingerprint: ${testFingerprint}`);
    console.log(`   Post ID: ${testPostId2}`);

    const { data: postBefore2 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId2)
        .single();

    console.log(`   Initial views: ${postBefore2?.views || 0}`);

    // First call with fingerprint
    const { data: result3, error: error3 } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId2,
        p_user_id: null,
        p_fingerprint: testFingerprint
    });

    console.log(`   First call result: ${result3 ? '✅ TRUE (incremented)' : '❌ FALSE (not incremented)'}`);

    const { data: postAfter3 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId2)
        .single();

    console.log(`   Views after 1st call: ${postAfter3?.views || 0}`);

    // Second call with same fingerprint - should NOT increment
    const { data: result4 } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId2,
        p_user_id: null,
        p_fingerprint: testFingerprint
    });

    console.log(`   Second call result: ${result4 ? '❌ TRUE (should be FALSE!)' : '✅ FALSE (duplicate prevented)'}`);

    const { data: postAfter4 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId2)
        .single();

    console.log(`   Views after 2nd call: ${postAfter4?.views || 0}`);

    // 4. Check board_post_views records
    console.log('\n[4] Checking board_post_views records...');
    const { data: viewRecords, error: viewError } = await supabase
        .from('board_post_views')
        .select('*')
        .in('post_id', [testPostId, testPostId2])
        .order('created_at', { ascending: false })
        .limit(10);

    if (viewError) {
        console.error('❌ Error fetching view records:', viewError);
    } else {
        console.log(`   Found ${viewRecords?.length || 0} view records:`);
        viewRecords?.forEach((record, i) => {
            console.log(`   ${i + 1}. Post ${record.post_id} - ${record.user_id ? `User ${record.user_id.substring(0, 8)}...` : `FP ${record.fingerprint?.substring(0, 12)}...`}`);
        });
    }

    console.log('\n=== Verification Complete ===');
}

verifyViewTracking();
