import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTableStructure() {
    console.log('\n=== Checking POSTS table structure ===\n');

    // Method: Try to select from table to see columns
    const { data: eventsSample, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .limit(1);

    if (eventsError) {
        console.log('Events query error:', eventsError.message);
    } else {
        console.log('Events Sample keys:', eventsSample && eventsSample.length > 0 ? Object.keys(eventsSample[0]) : 'Table is empty');
    }

    console.log('\n=== Checking SITE_ANALYTICS_LOGS table structure ===\n');

    const { data: logsSample, error: logsError } = await supabase
        .from('site_analytics_logs')
        .select('*')
        .limit(1);

    if (logsError) {
        console.log('Logs query error:', logsError.message);
    } else {
        console.log('Logs Sample keys:', logsSample && logsSample.length > 0 ? Object.keys(logsSample[0]) : 'Table is empty');
    }
}

checkTableStructure()
    .then(() => {
        console.log('\n✅ Structure check complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    });
