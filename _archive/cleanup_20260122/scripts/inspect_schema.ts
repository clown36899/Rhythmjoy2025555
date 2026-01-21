
import { createClient } from '@supabase/supabase-js';

// CREDENTIALS FROM NETLIFY ENV:LIST
const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase Service credentials');
    process.exit(1);
}

// Connect with Service Key - Inspecting PUBLIC schema for Tables, INFO schema for Routines
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const supabaseMeta = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: 'information_schema' } });

async function inspectSchema() {
    console.log('--- Inspecting Live DB Schema via Service Key ---');

    // 1. Check Function Definition
    // We use RPC to query pg_proc if possible, but standard REST usually blocks system tables.
    // EXCEPT: 'information_schema' is sometimes exposed.
    // If this failed before, we try the 'rpc' approach on a standard function to see if it works at all.

    // Let's try to infer if the function exists by calling it with identifying bad data.
    // (We already did this, getting "invalid syntax" -> Function Exists).

    // Let's check TABLE structure of 'board_posts'
    const { data: tableInfo, error: tableError } = await supabaseAdmin
        .from('board_posts')
        .select('*')
        .limit(1);

    if (tableError) {
        console.error('CRITICAL: Cannot access board_posts table:', tableError);
    } else {
        console.log('Table board_posts access OK. Sample row keys:', tableInfo && tableInfo[0] ? Object.keys(tableInfo[0]) : 'Table is Empty');

        // Check column types via metadata if possible?
        // Or simply inferred from JSON result.
        const row = tableInfo?.[0];
        // 1b. Check TRIGGERS on board_posts using META client
        console.log('\n--- Checking Triggers on board_posts ---');
        const { data: triggers, error: triggerError } = await supabaseMeta
            .from('triggers')
            .select('trigger_name, action_timing, event_manipulation, action_statement')
            .eq('event_object_table', 'board_posts');

        if (triggerError) {
            console.log('Error listing triggers:', triggerError.message);
        } else {
            console.log('Active Triggers:', JSON.stringify(triggers, null, 2));
        }

        if (row) {
            console.log(`Column "id" type: ${typeof row.id} (Value: ${row.id})`);
            console.log(`Column "views" type: ${typeof row.views} (Value: ${row.views})`);
        }
    }

    // 2. RETRY: Function Inspection via RPC call to a system function?
    // Most "introspective" queries are blocked over REST.
    // However, we know "increment_board_post_views" takes "bigint".
    // Let's call it with a NUMBER that definitely exists (76).
    // AND print the result.

    console.log('\n--- Functional Test ---');
    const targetId = 76;

    // Read Before
    const { data: before } = await supabaseAdmin.from('board_posts').select('views').eq('id', targetId).single();
    console.log(`Views Before: ${before?.views}`);

    // Execute
    const { error: rpcError } = await supabaseAdmin.rpc('increment_board_post_views', {
        p_post_id: targetId
    });

    if (rpcError) {
        console.error('RPC Error:', rpcError);
    } else {
        console.log('RPC Call Success (No Error returned)');
    }

    // Read After
    const { data: after } = await supabaseAdmin.from('board_posts').select('views').eq('id', targetId).single();
    console.log(`Views After: ${after?.views}`);

    if (before?.views === after?.views) {
        console.log('❌ FATAL: View count did NOT increment via RPC.');

        // DIAGNOSTIC: Try DIRECT UPDATE via Service Key
        console.log('\n--- Diagnostic: Direct Update Test ---');
        const { data: updateData, error: updateError } = await supabaseAdmin
            .from('board_posts')
            .update({ views: (before?.views || 0) + 1 })
            .eq('id', targetId)
            .select();

        if (updateError) {
            console.error('❌ Direct Update ERROR:', updateError);
        } else if (!updateData || updateData.length === 0) {
            console.error('❌ Direct Update Failed: No rows returned/affected (ID might be wrong?)');
        } else {
            console.log(`✅ Direct Update SUCCESS! New View Count: ${updateData[0].views}`);
            console.log('CONCLUSION: The Table is fine. The RPC Function is broken/ignored.');
        }
    } else {
        console.log('✅ SUCCESS: View count incremented via RPC!');
    }
}

inspectSchema();
