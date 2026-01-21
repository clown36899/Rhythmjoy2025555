import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Querying for N8...');
  const { data: schedule, error: sError } = await supabase
    .from('social_schedules')
    .select('id, title, views')
    .ilike('title', '%N8%')
    .single();

  if (sError) {
    console.error('Schedule Error:', sError);
  } else if (!schedule) {
    console.log('No schedule found with N8');
  } else {
    console.log('--- Schedule Table ---');
    console.log(schedule);

    const { count: vCount, error: vError } = await supabase
      .from('item_views')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', schedule.id)
      .eq('item_type', 'schedule');

    console.log('--- item_views Count ---');
    console.log(vCount, vError || '');

    const { count: lCount, error: lError } = await supabase
      .from('site_analytics_logs')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', schedule.id.toString())
      .or('target_type.eq.social,target_type.eq.schedule');

    console.log('--- site_analytics_logs Count ---');
    console.log(lCount, lError || '');
  }
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
