
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

async function checkRpc() {
    console.log('--- Verifying RPC Hypothesis ---');

    // 1. Get a valid post ID to test (Free Board)
    const { data: posts, error: fetchError } = await supabase
        .from('board_posts')
        .select('id')
        .limit(1);

    if (fetchError || !posts || posts.length === 0) {
        console.error('Failed to fetch a test post from board_posts:', fetchError);
        return;
    }

    const validPostId = posts[0].id; // This is a number in JS runtime
    console.log(`Found a valid post ID: ${validPostId} (Type: ${typeof validPostId})`);

    // 2. Test call with STRING (Simulating the bug)
    console.log('\n[Test 1] Calling RPC with STRING ID (Simulating current code)...');
    const stringId = String(validPostId);
    try {
        const { error: errorString } = await supabase.rpc('increment_board_post_views', {
            p_post_id: stringId as any // Force cast to avoid TS error, simulating runtime behavior
        });

        if (errorString) {
            console.log('✅ Expectation Matching (Fail): Code failed as expected.');
            console.log('   Error Code:', errorString.code);
            console.log('   Error Msg :', errorString.message);
            console.log('   Error Hint:', errorString.hint);
            console.log('   Error Details:', errorString.details);
        } else {
            console.log('❌ Unexpected Success: RPC accepted string ID? (Hypothesis might be wrong or auto-cast worked)');
        }
    } catch (e) {
        console.log('Javascript Exception:', e);
    }

    // 3. Test call with NUMBER (Simulating the fix)
    console.log('\n[Test 2] Calling RPC with NUMBER ID (Simulating fixed code)...');
    try {
        const { error: errorNumber } = await supabase.rpc('increment_board_post_views', {
            p_post_id: validPostId
        });

        if (errorNumber) {
            console.log('   Error:', errorNumber);
        } else {
            console.log('✅ Expectation Matching (Success): Code worked as expected with valid number.');
        }
    } catch (e) {
        console.log('Javascript Exception:', e);
    }
}

checkRpc();
