import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const client = new Client({
    connectionString,
});

async function runSQL() {
    try {
        await client.connect();
        await client.query(`NOTIFY pgrst, 'reload schema';`);
        console.log('Schema cache reloaded!');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.end();
    }
}

runSQL();
