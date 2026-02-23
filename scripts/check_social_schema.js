import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const tables = ['social_schedules', 'events'];

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
            // If empty/no data, try to get info via RPC if possible, or just say empty
            console.log(`Table ${table} has no rows or failed to fetch.`);
            // Try fetching just one row without selecting all just to be sure? select('*') is already doing that.
        }
    }
}

check();
