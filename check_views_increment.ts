
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkViewCountIncrement() {
    console.log('--- Verifying View Count Increment ---');

    // 1. Get a valid post ID
    const { data: posts, error: fetchError } = await supabase
        .from('board_posts')
        .select('id, views')
        .limit(1);

    if (fetchError || !posts || posts.length === 0) {
        console.error('Failed to fetch a test post from board_posts:', fetchError);
        return;
    }

    const post = posts[0];
    const postId = post.id;
    const initialViews = post.views || 0;

    console.log(`Target Post ID: ${postId}`);
    console.log(`Initial Views: ${initialViews}`);

    // 2. Call RPC with STRING ID (Simulating current code)
    console.log('\n[Test 1] Calling RPC with STRING ID...');
    const stringId = String(postId);

    await supabase.rpc('increment_board_post_views', {
        p_post_id: stringId as any
    });

    // Check after string call
    const { data: postAfterString } = await supabase.from('board_posts').select('views').eq('id', postId).single();
    console.log(`Views after STRING call: ${postAfterString?.views}`);

    // 3. Call RPC with NUMBER ID (Simulating fix)
    console.log('\n[Test 2] Calling RPC with NUMBER ID...');
    const { error: errNum } = await supabase.rpc('increment_board_post_views', {
        p_post_id: postId
    });
    if (errNum) console.error("Error with NUMBER:", errNum);

    // Check after number call
    const { data: postAfterNumber } = await supabase.from('board_posts').select('views').eq('id', postId).single();
    console.log(`Views after NUMBER call: ${postAfterNumber?.views}`);

    // 4. Call RPC with GARBAGE (To probe type)
    console.log('\n[Test 3] Calling RPC with "abc"...');
    const { error: errGarbage } = await supabase.rpc('increment_board_post_views', {
        p_post_id: "abc" as any
    });
    if (errGarbage) {
        console.log('Error with GARBAGE:', errGarbage.message);
        console.log('Error Code:', errGarbage.code);
    } else {
        console.log('GARBAGE accepted?!');
    }
}

checkViewCountIncrement();
