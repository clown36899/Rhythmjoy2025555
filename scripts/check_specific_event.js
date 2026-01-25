import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const searchTerm = '월피';
    console.log(`\n--- Searching social_schedules for title containing '${searchTerm}' ---`);
    const { data, error } = await supabase
        .from('social_schedules')
        .select('*')
        .ilike('title', `%${searchTerm}%`);

    if (error) {
        console.error('Error:', error);
    } else if (data && data.length > 0) {
        console.log(`Found ${data.length} rows in social_schedules:`);
        data.forEach(row => {
            console.log(`ID: ${row.id}, Title: ${row.title}`);
            console.log('Description:', row.description);
            console.log('-------------------');
        });
    } else {
        console.log('No rows found in social_schedules.');
    }

    console.log(`\n--- Searching events for title containing '${searchTerm}' ---`);
    const { data: eData } = await supabase
        .from('events')
        .select('*')
        .ilike('title', `%${searchTerm}%`);

    if (eData && eData.length > 0) {
        console.log(`Found ${eData.length} rows in events:`);
        eData.forEach(row => {
            console.log(`ID: ${row.id}, Title: ${row.title}`);
            console.log('Description:', row.description);
            console.log('-------------------');
        });
    } else {
        console.log('No rows found in events.');
    }
}

check();
