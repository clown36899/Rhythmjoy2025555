
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// CRITICAL: Use Service Key for inspection
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase Service credentials');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function inspectDb() {
    console.log('--- Inspecting Database State via Service Role ---');
    console.log('Connecting as ADMIN...');

    // 1. Inspect Function Definition from information_schema
    // Note: information_schema doesn't easily show "SECURITY DEFINER" property directly in standard columns for standard SQL,
    // but we can try querying pg_proc if we have access, or check specific routine info.

    // Since we can't run raw SQL easily without an RPC that allows it, 
    // we will try to infer the state by invoking it and seeing behaviors, 
    // or trying to call a meta-info RPC if one exists.

    // However, Supabase exposes a REST API for tables usually. 
    // We can try to query "information_schema.routines" via the API if exposed.
    // Often it's hidden. Let's try.

    console.log('\n[Task 1] Querying information_schema.routines...');
    const { data: routines, error: routineError } = await supabaseAdmin
        .from('routines')
        .select('*')
        .eq('routine_name', 'increment_board_post_views')
        .eq('routine_schema', 'public');

    // If the above fails (likely 404/PGRST permission on system schema), we fallback.
    if (routineError) {
        console.log('Unable to query information_schema directly via REST:', routineError.message);
    } else {
        console.log('Found Routines:', routines);
    }

    // 2. ALTERNATIVE: Use a known "exec_sql" or similar if the user has one? No.

    // 3. Test the function behavior as ADMIN vs ANON to deduce RLS.
    // We already know ANON fails (Update count 0).
    // Let's see if SERVICE ROLE succeeds.
    // If Service Role succeeds, it proves the Function itself works, but ANON lacks permissions (RLS blocked).

    const targetId = 76; // Using the ID from user logs

    // Check initial
    const { data: postBefore } = await supabaseAdmin.from('board_posts').select('views').eq('id', targetId).single();
    console.log(`\n[Task 2] Admin Check - ID ${targetId} Views: ${postBefore?.views}`);

    // Call RPC as ADMIN
    console.log('Calling RPC as SERVICE_ROLE...');
    const { error: rpcError } = await supabaseAdmin.rpc('increment_board_post_views', {
        p_post_id: targetId
    });

    if (rpcError) console.error('RPC Error (Admin):', rpcError);

    // Check after
    const { data: postAfter } = await supabaseAdmin.from('board_posts').select('views').eq('id', targetId).single();
    console.log(`[Task 2] Admin Check - ID ${targetId} Views: ${postAfter?.views}`);

    if ((postAfter?.views || 0) > (postBefore?.views || 0)) {
        console.log('\n[Conclusion] ✅ Function works for ADMIN.');
        console.log('This confirms the function LOGIC is valid, but Permissions/RLS block Anon/User.');
        console.log('PROOF: SECURITY DEFINER is missing or Grant is missing.');
    } else {
        console.log('\n[Conclusion] ❌ Function failed even for ADMIN.');
        console.log('This means the function logic is broken (e.g. updating wrong table/col) or triggers prevent update.');
    }
}

inspectDb();
