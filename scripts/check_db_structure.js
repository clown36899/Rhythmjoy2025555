import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTableStructure() {
    console.log('\n=== Checking board_anonymous_comment_likes structure ===\n');

    // Method 1: Try to select from table to see columns
    const { data: sampleData, error: sampleError } = await supabase
        .from('board_anonymous_comment_likes')
        .select('*')
        .limit(1);

    if (sampleError) {
        console.log('Sample query error:', sampleError.message);
    } else {
        console.log('Sample data columns:', sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : 'Table is empty');
    }

    // Method 2: Query information_schema using RPC
    const { data: schemaData, error: schemaError } = await supabase
        .rpc('exec_sql', {
            sql: `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'board_anonymous_comment_likes' 
                ORDER BY ordinal_position;
            `
        });

    if (schemaError) {
        console.log('\nRPC query error:', schemaError.message);
    } else {
        console.log('\nTable schema from information_schema:');
        console.table(schemaData);
    }

    console.log('\n=== Checking board_anonymous_comment_dislikes structure ===\n');

    const { data: dislikeSample, error: dislikeError } = await supabase
        .from('board_anonymous_comment_dislikes')
        .select('*')
        .limit(1);

    if (dislikeError) {
        console.log('Sample query error:', dislikeError.message);
    } else {
        console.log('Sample data columns:', dislikeSample && dislikeSample.length > 0 ? Object.keys(dislikeSample[0]) : 'Table is empty');
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
