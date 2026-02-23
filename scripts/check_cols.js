import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const tables = ['learning_categories', 'learning_playlists', 'learning_resources', 'history_nodes'];

    for (const table of tables) {
        console.log(`\n--- [${table}] Columns ---`);
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.error(`Error fetching ${table}:`, error.message);
        } else if (data && data.length > 0) {
            console.log(Object.keys(data[0]));
        } else {
            // If empty, use RPC or information_schema if available
            const { data: cols, error: colError } = await supabase.rpc('exec_sql', {
                query: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`
            }).catch(() => ({ data: null, error: 'RPC not available' }));

            if (cols) {
                console.log(cols.map(c => c.column_name));
            } else {
                console.log('Table is empty and RPC check failed.');
            }
        }
    }
}

check();
