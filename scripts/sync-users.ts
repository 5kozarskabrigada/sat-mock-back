
import { createClient, User } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncUsers() {
  console.log('Starting user sync...');

  // 1. Fetch all Auth users
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('Error listing auth users:', authError);
    return;
  }

  console.log(`Found ${users.length} users in Auth.`);

  // 2. Loop through and upsert into public.users
  for (const user of users) {
    const metadata = user.user_metadata || {};
    const username = metadata.username || user.email?.split('@')[0] || 'unknown';
    const firstName = metadata.first_name || 'Unknown';
    const lastName = metadata.last_name || 'User';
    const role = metadata.role || 'student';

    console.log(`Syncing user: ${user.email} (${role})`);

    const { error: upsertError } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        username: username,
        first_name: firstName,
        last_name: lastName,
        role: role,
        // We include password_hash because we know it exists and might be required
        password_hash: 'managed_by_supabase_auth_sync' 
      });

    if (upsertError) {
      console.error(`Failed to sync user ${user.email}:`, upsertError);
    } else {
      console.log(`Successfully synced ${user.email}`);
    }
  }

  console.log('Sync complete.');
}

syncUsers();
