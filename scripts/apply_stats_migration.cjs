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

        const sqlPath = path.join(__dirname, '../supabase/migrations/20260216_site_stats_index_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await client.query(sql);
        console.log('Migration applied successfully.');

        await client.query('SELECT public.refresh_site_stats_index();');
        console.log('refresh_site_stats_index() executed.');

        const res = await client.query('SELECT count(*) FROM public.site_stats_index;');
        console.log('Total index records created:', res.rows[0].count);

        const sample = await client.query('SELECT * FROM public.site_stats_index LIMIT 5;');
        console.log('Sample data:', sample.rows);

    } catch (err) {
        console.error('Error during migration execution:', err);
    } finally {
        await client.end();
    }
}

run();
