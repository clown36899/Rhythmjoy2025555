
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dbPassword = process.argv[2];

if (!dbPassword) {
    console.error('Please provide DB password as argument');
    process.exit(1);
}

// Get Project Ref from URL
const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];

if (!projectRef) {
    console.error('Could not extract Project Ref from VITE_PUBLIC_SUPABASE_URL');
    process.exit(1);
}

const connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;
console.log(`Connecting to ${projectRef}...`);

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Supabase requires SSL
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to DB.');

        const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/20260215_fix_stats_rpc.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying migration...');
        await client.query(sql);
        console.log('Migration applied successfully!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
