const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
    const client = new Client({
        host: 'db.mkoryudscamnopvxdelk.supabase.co',
        port: 5432,
        user: 'postgres',
        password: 'JyvroBqQKrxbOJca',
        database: 'postgres',
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to REMOTE database.');

        const sqlPath = path.join(__dirname, '../supabase/migrations/20260216_site_stats_index_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying index schema to Remote DB...');
        await client.query(sql);
        console.log('Schema applied successfully.');

        console.log('Running initial indexing (refresh_site_stats_index)...');
        await client.query('SELECT public.refresh_site_stats_index();');
        console.log('Initial indexing completed.');

        const countRes = await client.query('SELECT count(*) FROM public.site_stats_index;');
        console.log('Total remote index records created:', countRes.rows[0].count);

    } catch (err) {
        console.error('Remote execution failed:', err);
    } finally {
        await client.end();
    }
}

run();
