
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPresets() {
    console.log('--- Metronome Presets ---');
    const { data, error } = await supabase
        .from('metronome_presets')
        .select('id, user_id, name, subdivision, bpm, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
    } else {
        console.table(data);
        const straightPresets = data?.filter(p => p.name === 'Straight');
        console.log('\n--- Straight Presets Detail ---');
        console.log(straightPresets);
    }
}

checkPresets();
