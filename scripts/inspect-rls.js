import { createClient } from '@supabase/supabase-js';

// Load env vars injected by Netlify Dev
const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY; // Use Service Key to inspect DB structure

console.log('🔍 Checking Environment Variables...');
console.log('   VITE_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'FOUND' : 'MISSING');
console.log('   SUPABASE_SERVICE_KEY:', serviceKey ? 'FOUND' : 'MISSING');

if (!supabaseUrl || !serviceKey) {
    console.error('❌ Cannot inspect structure without Service Key.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function inspectStructure() {
    console.log('\n🔍 Inspecting DB Structure & Policies...');

    // 1. Check if table exists (requires access to information_schema)
    // Since we can't always access information_schema easily with JS client (depending on exposed schemas),
    // we will try to select from the table with limit 0.
    const { error: tableError } = await supabase
        .from('learning_playlists')
        .select('id')
        .limit(0);

    if (tableError) {
        console.error('❌ Table Check Failed:', tableError.message);
        console.log('   This implies the table "learning_playlists" might NOT exist on the server.');
        return;
    }
    console.log('✅ Table "learning_playlists" exists.');

    // 2. Check Policies
    // Query specific view if exposed, or fallback to RPC if custom one exists.
    // Standard Supabase doesn't expose pg_policies to REST API by default unless we use a custom function/view.
    // BUT we can infer policies by trying operations.

    // However, the user wants "Structure" via "CLI".
    // Let's try to query the REST endpoint for a custom RPC that Supabase might have, or just try to INSERT with the Service Key.
    // If Insert with Service Key works, it proves Env Vars are fine and Table exists.
    // If Insert with Anon Key (simulated in previous step) failed, it proves RLS is the blocker.

    // Let's re-verify the "Anonymous/Authenticated" simulated insert failure vs Service Key success.

    console.log('\n🧪 Test 1: Insert verification with SERVICE KEY (Bypass RLS)');
    const testRecord = {
        title: 'CLI Structure Verification',
        description: 'Verified with valid User ID',
        author_id: 'b3c11164-3039-42f1-ae53-f0fb1952f969', // Real User ID from logs
        is_public: false
    };
    const { data: adminData, error: adminError } = await supabase
        .from('learning_playlists')
        .insert(testRecord)
        .select()
        .single();

    if (adminError) {
        console.error('❌ Service Key Insert Failed:', adminError.message);
        console.log('   This is critical. If even Admin can\'t insert, the table might trigger an error or key is wrong.');
    } else {
        console.log('✅ Service Key Insert SUCCESS. Record ID:', adminData.id);
        console.log('   => This PROVES the environment variables are correct and the DB connection is working.');
        console.log('   => This PROVES the table exists.');

        // Clean up
        await supabase.from('learning_playlists').delete().eq('id', adminData.id);
        console.log('   (Test record cleaned up)');
    }

}

inspectStructure();
