import { createClient } from '@supabase/supabase-js';

async function fixAdmin() {
  const url = process.env.VITE_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const adminEmail = process.env.VITE_ADMIN_EMAIL;
  
  if (!url || !key || !adminEmail) {
    console.error('Missing env vars');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  
  const { data: { users }, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    console.error('Error fetching users:', userErr);
    return;
  }
  
  const adminUser = users.find(u => u.email === adminEmail);
  
  if (!adminUser) {
    console.log(`User with VITE_ADMIN_EMAIL (${adminEmail}) not found`);
    return;
  }
  
  console.log(`Found admin user: ${adminUser.id} (${adminUser.email})`);
  
  const { error: insertErr } = await supabase
    .from('board_admins')
    .upsert({ user_id: adminUser.id }, { onConflict: 'user_id' });
    
  if (insertErr) {
    console.error('Error inserting into board_admins:', insertErr);
  } else {
    console.log(`Successfully added user ${adminUser.email} to board_admins!`);
  }
}

fixAdmin();
