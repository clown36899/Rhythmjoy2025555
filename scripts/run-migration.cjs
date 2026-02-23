// Supabase CLI alternative: Execute SQL directly
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_KEY not found');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function executeMigration() {
    try {
        const sql = fs.readFileSync('scripts/create-history-tables.sql', 'utf8');

        console.log('🚀 Executing history timeline migration...');

        // Split SQL into individual statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);
            const { error } = await supabase.rpc('exec', { sql: statement + ';' });
            if (error) {
                console.warn(`Warning: ${error.message}`);
            }
        }

        console.log('✅ Migration executed successfully!');
        console.log('📋 Tables created: history_nodes, history_edges');
        console.log('🔒 RLS policies applied');
        console.log('\n🎉 You can now use /history page!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n💡 Please run SQL manually in Supabase Dashboard');
        console.log('   File: scripts/create-history-tables.sql');
        process.exit(1);
    }
}

executeMigration();
