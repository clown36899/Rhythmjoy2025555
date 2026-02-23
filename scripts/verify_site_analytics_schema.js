
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        envVars[match[1].trim()] = match[2].trim();
    }
});

const supabaseUrl = envVars['VITE_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envVars['SUPABASE_SERVICE_KEY'];

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

console.log('🔍 Checking site_analytics_logs table schema...\n');

// Fetch one row to inspect columns
const { data, error } = await supabase
    .from('site_analytics_logs')
    .select('*')
    .limit(1);

if (error) {
    console.error('❌ Error fetching site_analytics_logs:', error);
} else if (data && data.length > 0) {
    console.log('✅ Connection successful. Table exists.');
    console.log('📋 Columns detected based on first row:');
    const columns = Object.keys(data[0]);
    columns.forEach(col => console.log(` - ${col}`));
} else {
    console.log('⚠️ Table accessed but is empty. Cannot infer columns from data.');
}
