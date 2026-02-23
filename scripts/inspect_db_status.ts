
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dbPassword = process.argv[2];
if (!dbPassword) { console.error('Need password'); process.exit(1); }

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];
const connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    try {
        await client.connect();
        console.log('--- Inspecting DB Function ---');

        // 1. Get Function Definition
        const res = await client.query(`
            SELECT prosrc 
            FROM pg_proc 
            WHERE proname = 'refresh_site_metrics';
        `);

        if (res.rows.length === 0) {
            console.log('Function refresh_site_metrics NOT FOUND in DB.');
        } else {
            console.log('Found function definition in DB:');
            console.log('---------------------------------------------------');
            console.log(res.rows[0].prosrc);
            console.log('---------------------------------------------------');
        }

        // 2. Check Event Counts directly
        const countAll = await client.query(`SELECT count(*) FROM events WHERE category NOT IN ('notice', 'board')`);
        console.log(`Events Count (All Time): ${countAll.rows[0].count}`);

        const count1y = await client.query(`
            SELECT count(*) FROM events 
            WHERE category NOT IN ('notice', 'board')
            AND (created_at >= (now() - interval '1 year') OR start_date >= (now() - interval '1 year')::text)
        `);
        console.log(`Events Count (1 Year): ${count1y.rows[0].count}`);

    } catch (err) {
        console.error('Inspection failed:', err);
    } finally {
        await client.end();
    }
}

inspect();
