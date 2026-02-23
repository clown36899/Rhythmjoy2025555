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

        console.log('Applying index schema migration...');
        await client.query(sql);
        console.log('Migration applied.');

        console.log('Refreshing site stats index...');
        await client.query('SELECT public.refresh_site_stats_index();');
        console.log('Refresh function executed.');

        const countRes = await client.query('SELECT count(*) FROM public.site_stats_index;');
        console.log('Total index records:', countRes.rows[0].count);

        const typeRes = await client.query('SELECT metric_type, count(*) FROM public.site_stats_index GROUP BY metric_type;');
        console.log('Metrics Breakdown:', typeRes.rows);

        const sample = await client.query('SELECT * FROM public.site_stats_index LIMIT 3;');
        console.log('Sample records:', sample.rows);

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await client.end();
    }
}

run();
