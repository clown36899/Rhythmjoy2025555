
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use Service Role Key for Admin access

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or SERVICE KEY in .env');
    console.log('Available Env Vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('=== DB DIAGNOSIS STARTED ===');

    // 1. Check Table Columns
    console.log('\n[1] Checking Table Columns (user_push_subscriptions)...');
    try {
        // Direct query to information_schema is not easily possible via RPC unless custom function exists.
        // Instead, we'll Try to select * limit 1 to see structure implicitly or just rely on RPC check.
        // With SERVICE KEY, we can select from the table directly.
        const { data: tableData, error: tableError } = await supabase
            .from('user_push_subscriptions')
            .select('*')
            .limit(1);

        if (tableError) {
            console.error('Table Select Error:', tableError);
        } else {
            console.log('Table Access: SUCCESS');
            console.log('Sample Data:', tableData);
        }
    } catch (e) {
        console.error('Table Check Failed:', e);
    }

    // Since we can't easily query information_schema with ANON key usually (unless exposed),
    // we will try to insert a dummy record to see constraints errors, OR
    // we will rely on the error message return.

    // But better yet, let's try to call the RPC function and see if it exists.
    console.log('\n[2] Checking RPC Function (handle_push_subscription)...');
    try {
        const { error } = await supabase.rpc('handle_push_subscription', {
            p_endpoint: 'test_endpoint_' + Date.now(),
            p_subscription: {},
            p_user_agent: 'diagnostic-script',
            p_is_admin: false,
            p_pref_events: true,
            p_pref_lessons: true,
            p_pref_filter_tags: null
        });

        if (error) {
            console.error('RPC Call Result: FAILED');
            console.error('Error Details:', JSON.stringify(error, null, 2));
        } else {
            console.log('RPC Call Result: SUCCESS (Function exists and works)');
        }
    } catch (e) {
        console.error('RPC Call Threw Exception:', e);
    }

    console.log('\n[3] Testing Constraints & Upsert...');
    const testEndpoint = 'test_constraint_' + Date.now();

    // 3-A. First Insert
    const { error: insert1 } = await supabase.from('user_push_subscriptions').insert({ endpoint: testEndpoint, subscription: {} });
    console.log('Insert 1:', insert1 ? 'FAILED' : 'SUCCESS');

    // 3-B. Second Insert (Duplicate) - Should Fail if Unique Constraint Exists
    const { error: insert2 } = await supabase.from('user_push_subscriptions').insert({ endpoint: testEndpoint, subscription: {} });
    console.log('Insert 2 (Duplicate):', insert2 ? 'FAILED (Constraint Exists)' : 'SUCCESS (Constraint MISSING!)');
    if (insert2) console.log('Insert 2 Error:', insert2.message);

    // 3-C. Upsert (On Conflict) - Should Fail if 42P10
    const { error: upsert } = await supabase.from('user_push_subscriptions').upsert({ endpoint: testEndpoint, subscription: { updated: true } }, { onConflict: 'endpoint' });
    console.log('Upsert Test:', upsert ? 'FAILED (42P10? check API)' : 'SUCCESS (API Config OK)');
    if (upsert) console.log('Upsert Error:', upsert.code, upsert.message);

    console.log('=== DB DIAGNOSIS FINISHED ===');
}

diagnose();
