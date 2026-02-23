const { Client } = require('pg');

async function run() {
    const client = new Client({
        host: 'db.mkoryudscamnopvxdelk.supabase.co',
        port: 5432,
        user: 'postgres',
        password: 'JyvroBqQKrxbOJca',
        database: 'postgres'
    });

    try {
        await client.connect();
        console.log('Connected to remote database.');

        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'events'
      ORDER BY ordinal_position;
    `);

        console.log('Remote Events table columns:');
        res.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type}`);
        });

    } catch (err) {
        console.error('Error connecting to remote DB:', err);
    } finally {
        await client.end();
    }
}

run();
