
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function inspectTable(tableName) {
    console.log(`\n=== Table: ${tableName} ===`);

    // 1. Row Count
    const { count, error: countError } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('Count Error:', countError.message);
        return;
    }
    console.log(`Tuple Count: ${count}`);

    // 2. Sample Data Integrity
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(3)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Select Error:', error.message);
        return;
    }

    if (data.length > 0) {
        const keys = Object.keys(data[0]);
        console.log('Columns:', keys.join(', '));

        // Check for NULLs in critical columns
        data.forEach((row, i) => {
            const criticalNulls = [];
            if (tableName === 'session_logs') {
                if (row.session_id === null) criticalNulls.push('session_id');
                // user_id and fingerprint can be null individually, but not both ideally? (check usage)
            }
            if (criticalNulls.length > 0) {
                console.warn(`⚠️ Row ${i} has NULLs in: ${criticalNulls.join(', ')}`);
            }
        });
    } else {
        console.log('No data found.');
    }

    // Note: We cannot check Indexes directly via JS Client easily without SQL query, 
    // but we can infer performance issues if queries are slow later.
}

async function audit() {
    await inspectTable('session_logs');
    await inspectTable('site_analytics_logs');
    await inspectTable('pwa_installs');
}

audit();
