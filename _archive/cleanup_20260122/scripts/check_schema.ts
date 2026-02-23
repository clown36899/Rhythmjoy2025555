
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns(tableName: string) {
    console.log(`\n🔍 Checking columns for table: [${tableName}]`);

    const { data, error } = await supabase.from(tableName).select('*').limit(1);

    if (error) {
        console.error(`❌ Error querying ${tableName}:`, error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log(`⚠️ Table ${tableName} is empty. Checking specific columns...`);

        const colsToCheck = ['grid_row', 'grid_column', 'order_index', 'parent_id', 'id'];
        for (const col of colsToCheck) {
            const { error: colError } = await supabase.from(tableName).select(col).limit(1);
            if (colError) {
                console.error(`   ❌ Column '${col}' access failed: ${colError.message}`);
            } else {
                console.log(`   ✅ Column '${col}' EXISTS.`);
            }
        }
        return;
    }

    const row = data[0];
    const keys = Object.keys(row);
    console.log(`✅ Found keys in ${tableName}:`, keys.join(', '));

    console.log(`   - grid_row present? ${keys.includes('grid_row') ? 'YES' : 'NO'}`);
    console.log(`   - grid_column present? ${keys.includes('grid_column') ? 'YES' : 'NO'}`);
}

async function main() {
    await checkColumns('learning_categories');
    await checkColumns('learning_resources');
    await checkColumns('history_nodes');
}

main();
