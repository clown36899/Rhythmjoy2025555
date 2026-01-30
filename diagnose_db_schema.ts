
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// Prefer Service Key for admin access, fallback to Anon key
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env');
    console.log('Available Env Keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Connecting to Supabase:', supabaseUrl);

    // Try to select a single row to see the headers/keys
    const { data, error } = await supabase
        .from('user_push_subscriptions')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error querying user_push_subscriptions:', error);
        // If table doesn't exist, it will say so.
        return;
    }

    if (!data || data.length === 0) {
        console.log('Table exists but is empty. Trying to select specific columns to check existence.');

        // Check pref_class (Correct standardized naming)
        const columnsToCheck = ['pref_class', 'pref_events', 'pref_clubs'];

        for (const col of columnsToCheck) {
            const { error: colError } = await supabase
                .from('user_push_subscriptions')
                .select(col)
                .limit(1);

            if (colError) {
                console.log(`Column '${col}': MISSING (Score: 0) - Error: ${colError.message}`);
            } else {
                console.log(`Column '${col}': EXISTS (Score: 1)`);
            }
        }
    } else {
        console.log('Successfully fetched a row.');
        const keys = Object.keys(data[0]);
        console.log('Actual DB Columns found:', keys);

        if (keys.includes('pref_class')) console.log('CONFIRMED: pref_class column EXISTS.');
        else console.log('CONFIRMED: pref_class column DOES NOT EXIST.');
    }
}

checkSchema();
