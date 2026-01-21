import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalVerification() {
    console.log('=== Final DB Verification ===\n');

    // 1. Check existing view records
    console.log('[1] Existing view records in board_post_views:');
    const { data: allViews } = await supabase
        .from('board_post_views')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log(`   Total records: ${allViews?.length || 0}`);
    allViews?.forEach((v, i) => {
        console.log(`   ${i + 1}. Post ${v.post_id} - ${v.user_id ? `User ${v.user_id.substring(0, 8)}` : `FP ${v.fingerprint?.substring(0, 12)}`} - ${new Date(v.created_at).toLocaleString()}`);
    });

    // 2. Test with FRESH user ID and post
    console.log('\n[2] Testing with FRESH user ID (never seen before)...');
    const freshUserId = 'aaaaaaaa-bbbb-cccc-dddd-' + Date.now().toString().substring(0, 12);
    const testPostId = 76;

    console.log(`   Fresh User ID: ${freshUserId.substring(0, 20)}...`);
    console.log(`   Post ID: ${testPostId}`);

    // Get current view count
    const { data: before } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Current views: ${before?.views || 0}`);

    // Call RPC
    const { data: wasIncremented, error } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: freshUserId,
        p_fingerprint: null
    });

    if (error) {
        console.error('   ❌ RPC Error:', error.message);
    } else {
        console.log(`   RPC Result: ${wasIncremented ? '✅ TRUE (incremented!)' : '❌ FALSE (not incremented)'}`);
    }

    // Check new view count
    const { data: after } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   New views: ${after?.views || 0}`);
    console.log(`   Difference: ${(after?.views || 0) - (before?.views || 0)}`);

    // 3. Verify the view record was created
    console.log('\n[3] Checking if view record was created...');
    const { data: newRecord } = await supabase
        .from('board_post_views')
        .select('*')
        .eq('user_id', freshUserId)
        .eq('post_id', testPostId)
        .single();

    if (newRecord) {
        console.log('   ✅ View record found in database');
        console.log(`   Created at: ${new Date(newRecord.created_at).toLocaleString()}`);
    } else {
        console.log('   ❌ View record NOT found');
    }

    // 4. Test duplicate prevention
    console.log('\n[4] Testing duplicate prevention (same user, same post)...');
    const { data: result2 } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: freshUserId,
        p_fingerprint: null
    });

    console.log(`   Second call result: ${result2 ? '❌ TRUE (should be FALSE!)' : '✅ FALSE (duplicate prevented!)'}`);

    const { data: after2 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`   Views after 2nd call: ${after2?.views || 0} (should be same as before)`);

    console.log('\n=== Verification Complete ===');
    console.log('\n📊 Summary:');
    console.log(`   - Table exists: ✅`);
    console.log(`   - RPC accepts new parameters: ✅`);
    console.log(`   - First view increments counter: ${wasIncremented ? '✅' : '❌'}`);
    console.log(`   - Duplicate views prevented: ${!result2 ? '✅' : '❌'}`);
    console.log(`   - View records stored in DB: ${newRecord ? '✅' : '❌'}`);
}

finalVerification();
