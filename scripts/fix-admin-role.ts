
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAdminRole() {
  const email = 'admin@sat-platform.local';
  
  console.log(`Fixing role for ${email}...`);

  // 1. Find the user in Auth to get the ID
  const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers();
  
  if (searchError) {
    console.error('Error listing users:', searchError);
    return;
  }

  const adminUser = users.find(u => u.email === email);

  if (!adminUser) {
    console.error('Admin user not found in Auth! Please run reset-admin-password.ts first.');
    return;
  }

  console.log(`Found Auth User ID: ${adminUser.id}`);

  // 2. Clean up any zombie rows in public.users with username 'admin' but different ID
  const { data: zombieUsers, error: zombieError } = await supabase
    .from('users')
    .select('*')
    .eq('username', 'admin');

  if (zombieUsers && zombieUsers.length > 0) {
    for (const zUser of zombieUsers) {
      if (zUser.id !== adminUser.id) {
        console.log(`Found zombie user with username 'admin' but different ID (${zUser.id}). Deleting...`);
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', zUser.id);
        
        if (deleteError) {
          console.error('Error deleting zombie user:', deleteError);
        } else {
          console.log('Zombie user deleted.');
        }
      }
    }
  }

  // 3. Update Auth Metadata (for consistency)
  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
    adminUser.id,
    { app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } }
  );

  if (authUpdateError) {
    console.error('Error updating auth metadata:', authUpdateError);
  } else {
    console.log('Auth metadata updated.');
  }

  // 4. Upsert Public Users Table
  const { data, error: publicUpdateError } = await supabase
    .from('users')
    .upsert({ 
      id: adminUser.id,
      role: 'admin',
      username: 'admin',
      first_name: 'System',
      last_name: 'Admin',
      password_hash: 'managed_by_supabase_auth_admin_reset'
    })
    .select();

  if (publicUpdateError) {
    console.error('Error updating public.users:', publicUpdateError);
  } else {
    console.log('Public users table updated successfully:', data);
  }
}

fixAdminRole();
