import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
// Verified Service Key from `npx netlify env:list`
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTableStructure() {
    console.log('\n=== Checking learning_documents structure ===\n');

    // Method 1: Try to select from table to see columns
    const { data: sampleData, error: sampleError } = await supabase
        .from('learning_documents')
        .select('*')
        .limit(1);

    if (sampleError) {
        console.log('Sample query error:', sampleError.message);
    } else {
        console.log('Sample data columns:', sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : 'Table is empty');
        if (sampleData && sampleData.length > 0) {
            console.log('\nSample row:');
            console.log(JSON.stringify(sampleData[0], null, 2));
        }
    }

    // Method 2: Query information_schema using RPC
    const { data: schemaData, error: schemaError } = await supabase
        .rpc('exec_sql', {
            sql: `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'learning_documents' 
                ORDER BY ordinal_position;
            `
        });

    if (schemaError) {
        console.log('\nRPC query error:', schemaError.message);
    } else {
        console.log('\nTable schema from information_schema:');
        console.table(schemaData);
    }
}

checkTableStructure()
    .then(() => {
        console.log('\n✅ Structure check complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    });
