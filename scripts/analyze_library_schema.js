import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deepAnalyze() {
    console.log('# Deep Database Schema Investigation\n');

    // 1. Column details using RPC
    const tables = ['learning_resources', 'history_nodes', 'learning_categories'];

    for (const table of tables) {
        console.log(`## Detailed Structure: ${table}`);
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `
                SELECT 
                    column_name, 
                    data_type, 
                    is_nullable, 
                    column_default,
                    character_maximum_length
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = '${table}'
                ORDER BY ordinal_position;
            `
        });

        if (error) {
            console.log(`- RPC failed: ${error.message}`);
        } else {
            console.table(data);
        }
    }

    // 2. Foreign Key constraints
    console.log('\n## Foreign Key Constraints for history_nodes');
    const { data: fks, error: fkError } = await supabase.rpc('exec_sql', {
        sql: `
            SELECT
                tc.constraint_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='history_nodes';
        `
    });

    if (fkError) {
        console.log(`- FK Query failed: ${fkError.message}`);
    } else {
        console.table(fks);
    }

    // 3. Unique indices / constraints
    console.log('\n## Unique Constraints / Indices');
    const { data: idx, error: idxError } = await supabase.rpc('exec_sql', {
        sql: `
            SELECT
                i.relname as index_name,
                a.attname as column_name
            FROM
                pg_class t,
                pg_class i,
                pg_index ix,
                pg_attribute a
            WHERE
                t.oid = ix.indrelid
                AND i.oid = ix.indexrelid
                AND a.attrelid = t.oid
                AND a.attnum = ANY(ix.indkey)
                AND t.relkind = 'r'
                AND t.relname IN ('learning_resources', 'history_nodes')
                AND ix.indisunique = true;
        `
    });

    if (idxError) {
        console.log(`- Index Query failed: ${idxError.message}`);
    } else {
        console.table(idx);
    }
}

deepAnalyze()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
