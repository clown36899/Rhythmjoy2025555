
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getTriggerFunction() {
    console.log('--- Fetching suppress_views_realtime Function Definition ---');

    // Query pg_proc for the function definition
    // We need to use RPC or direct SQL query, but Supabase REST doesn't expose pg_proc directly
    // Let's try to infer from the trigger's action_statement

    const { data: triggers, error } = await supabase
        .schema('information_schema')
        .from('triggers')
        .select('*')
        .eq('trigger_name', 'suppress_views_realtime')
        .eq('event_object_table', 'board_posts');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Trigger Details:', JSON.stringify(triggers, null, 2));
    }
}

getTriggerFunction();
