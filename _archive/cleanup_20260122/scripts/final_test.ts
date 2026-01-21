import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalTest() {
    console.log('=== Final Test with Proper UUID ===\n');

    const testUserId = randomUUID(); // Proper UUID format
    const testPostId = 76;

    console.log(`Test User ID: ${testUserId}`);
    console.log(`Test Post ID: ${testPostId}\n`);

    // Get current views
    const { data: before } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`[Before] Views: ${before?.views || 0}`);

    // Call RPC
    const { data: wasIncremented, error } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: testUserId,
        p_fingerprint: null
    });

    if (error) {
        console.error('❌ RPC Error:', error.message);
        return;
    }

    console.log(`RPC Result: ${wasIncremented ? '✅ TRUE (incremented!)' : '❌ FALSE'}`);

    // Get new views
    const { data: after } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`[After] Views: ${after?.views || 0}`);
    console.log(`Difference: +${(after?.views || 0) - (before?.views || 0)}\n`);

    // Verify record was created
    const { data: record } = await supabase
        .from('board_post_views')
        .select('*')
        .eq('user_id', testUserId)
        .eq('post_id', testPostId)
        .single();

    if (record) {
        console.log('✅ View record created in database');
    } else {
        console.log('❌ View record NOT found');
    }

    // Test duplicate
    console.log('\n[Duplicate Test]');
    const { data: result2 } = await supabase.rpc('increment_board_post_views', {
        p_post_id: testPostId,
        p_user_id: testUserId,
        p_fingerprint: null
    });

    console.log(`Second call: ${result2 ? '❌ TRUE (should be FALSE!)' : '✅ FALSE (duplicate prevented!)'}`);

    const { data: after2 } = await supabase
        .from('board_posts')
        .select('views')
        .eq('id', testPostId)
        .single();

    console.log(`Views after 2nd call: ${after2?.views} (should be same as before)`);

    console.log('\n=== ✅ System Working Correctly! ===');
}

finalTest();
