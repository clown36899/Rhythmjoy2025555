
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

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
