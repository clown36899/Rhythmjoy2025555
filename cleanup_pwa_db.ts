
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupNonMemberInstalls() {
    console.log('Cleaning up non-member PWA installs...');

    const { count, error } = await supabase
        .from('pwa_installs')
        .delete({ count: 'exact' })
        .is('user_id', null);

    if (error) {
        console.error('Cleanup failed:', error);
    } else {
        console.log(`Successfully deleted ${count} non-member records.`);
    }
}

cleanupNonMemberInstalls();
