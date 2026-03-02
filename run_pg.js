import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const connectionString = 'postgresql://postgres:5Go7aHutmffqk8Je@db.mkoryudscamnopvxdelk.supabase.co:5432/postgres';

const client = new Client({
    connectionString,
});

async function run() {
    await client.connect();
    const sql = fs.readFileSync('/tmp/query.sql', 'utf8');
    try {
        const res = await client.query(sql);
        console.log('Success:', res);
    } catch (err) {
        console.error('Error applying schema:', err);
    } finally {
        await client.end();
    }
}

run();
