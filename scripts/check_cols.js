import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

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
