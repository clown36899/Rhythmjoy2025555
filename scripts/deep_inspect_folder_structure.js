import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || 'https://mkoryudscamnopvxdelk.supabase.co';
// Using the service key directly as environment variable might not be set in CLI
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyze() {
    console.log('🕵️‍♀️ Deep Inspection: Folder Architecture');

    // 1. Check learning_resources structure for parent_id (Self-Referencing check)
    console.log('\n[1] Check learning_resources columns');
    const { data: cols, error: colError } = await supabase
        .from('learning_resources')
        .select('*')
        .limit(1);

    if (cols && cols.length > 0) {
        const keys = Object.keys(cols[0]);
        console.log('Columns:', keys.join(', '));
        console.log('Has parent_id?', keys.includes('parent_id'));
        console.log('Has category_id?', keys.includes('category_id'));
    } else {
        console.log('Could not fetch columns (table empty?)');
    }

    // 2. Check content types
    console.log('\n[2] Resource Types Distribution');
    const { data: types, error: typeError } = await supabase
        .from('learning_resources')
        .select('type');

    if (types) {
        const counts = {};
        types.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
        console.table(counts);
    }

    // 3. Check learning_categories structure
    console.log('\n[3] learning_categories structure');
    const { data: catCols, error: catColError } = await supabase
        .from('learning_categories')
        .select('*')
        .limit(1);

    if (catCols && catCols.length > 0) {
        console.log('Category Columns:', Object.keys(catCols[0]).join(', '));
    } else {
        console.log('Category Table is empty or error.');
    }
}

analyze().then(() => process.exit(0));
