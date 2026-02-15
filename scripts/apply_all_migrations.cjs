const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    });

    try {
        await client.connect();
        console.log('Connected to local database.');

        const migrationFiles = [
            '20260215000000_merge_social_events.sql',
            '20260215_fix_stats_rpc.sql',
            '20260216_site_stats_index_schema.sql'
        ];

        for (const file of migrationFiles) {
            console.log(`Applying migration: ${file}...`);
            const sqlPath = path.join(__dirname, '../supabase/migrations/', file);
            const sql = fs.readFileSync(sqlPath, 'utf8');

            try {
                await client.query(sql);
                console.log(`Migration ${file} applied successfully.`);
            } catch (err) {
                console.error(`Error applying ${file}:`, err.message);
                // Continue if it's "already exists" error
                if (!err.message.includes('already exists')) {
                    throw err;
                }
            }
        }

        console.log('All migrations applied. Testing refresh function...');
        await client.query('SELECT public.refresh_site_stats_index();');
        console.log('refresh_site_stats_index() executed successfully.');

        const res = await client.query('SELECT count(*) FROM public.site_stats_index;');
        console.log('Total index records created:', res.rows[0].count);

    } catch (err) {
        console.error('Fatal error during migration execution:', err);
    } finally {
        await client.end();
    }
}

run();
