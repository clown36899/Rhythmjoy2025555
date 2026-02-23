import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableStructure() {
    console.log('\n=== board_anonymous_comment_likes ===');
    const { data: likesData, error: likesError } = await supabase
        .from('board_anonymous_comment_likes')
        .select('*')
        .limit(1);

    if (likesError) {
        console.error('Error:', likesError.message);
    } else if (likesData && likesData.length > 0) {
        console.log('Columns:', Object.keys(likesData[0]));
    } else {
        console.log('Table is empty, trying to describe...');
    }

    console.log('\n=== board_anonymous_comment_dislikes ===');
    const { data: dislikesData, error: dislikesError } = await supabase
        .from('board_anonymous_comment_dislikes')
        .select('*')
        .limit(1);

    if (dislikesError) {
        console.error('Error:', dislikesError.message);
    } else if (dislikesData && dislikesData.length > 0) {
        console.log('Columns:', Object.keys(dislikesData[0]));
    } else {
        console.log('Table is empty, trying to describe...');
    }

    // Try RPC to get table structure
    console.log('\n=== Using information_schema ===');
    const { data: schemaData, error: schemaError } = await supabase.rpc('exec_sql', {
        query: `
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'board_anonymous_comment_likes' 
            ORDER BY ordinal_position;
        `
    });

    if (schemaError) {
        console.error('Schema query error:', schemaError.message);
    } else {
        console.log('Schema:', schemaData);
    }
}

checkTableStructure().then(() => process.exit(0)).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
