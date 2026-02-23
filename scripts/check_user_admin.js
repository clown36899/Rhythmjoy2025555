import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_KEY missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser(email) {
    const { data, error } = await supabase
        .from('board_users')
        .select('user_id, email, is_admin, nickname')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user:', error);
        return;
    }

    console.log('User found:', data);
}

checkUser('clown313joy@gmail.com');
