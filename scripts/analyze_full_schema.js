
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
// Using the service key found in existing scripts for admin access to schema
const supabaseKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const tables = [
        'events',
        'board_posts',
        'board_users',
        'board_comments',
        'learning_resources',
        'learning_video_bookmarks',
        'site_analytics_logs',
        'history_nodes',
        'billboard_users',
        'billboard_settings'
    ];

    console.log('=== DB SCHEMA ANALYSIS ===\n');

    for (const table of tables) {
        process.stdout.write(`Checking ${table}... `);

        // 1. Try to get sample data (fastest way to see columns)
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.log(`\n❌ Error fetching ${table}:`, error.message);
        } else if (data && data.length > 0) {
            console.log('✅ Found columns:');
            const keys = Object.keys(data[0]);
            console.log(JSON.stringify(keys, null, 2));

            // Check for specific critical columns
            if (table === 'events' && !keys.includes('show_title_on_billboard')) {
                console.log('⚠️ Warning: show_title_on_billboard column missing in events');
            }
        } else {
            console.log('\n⚠️ Table is empty, attempting RPC reflection...');
            // If empty, use information_schema via RPC if possible
            const { data: cols, error: colError } = await supabase.rpc('exec_sql', {
                query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'`
            }).catch(() => ({ data: null, error: 'RPC not available' }));

            if (cols) {
                console.log('✅ Found columns via RPC:');
                console.log(JSON.stringify(cols.map(c => c.column_name), null, 2));
            } else {
                console.log('❌ Failed to get schema (Empty table + RPC failed)');
            }
        }
        console.log('-'.repeat(40) + '\n');
    }
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
