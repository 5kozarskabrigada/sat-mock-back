
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

async function resetAdmin() {
  const email = 'admin@sat-platform.local';
  const newPassword = 'adminPassword123!';

  console.log(`Resetting password for ${email}...`);

  // 1. Find the user ID
  const { data: users, error: searchError } = await supabase.auth.admin.listUsers();
  
  if (searchError) {
    console.error('Error listing users:', searchError);
    return;
  }

  const adminUser = users.users.find(u => u.email === email);

  if (!adminUser) {
    console.error('Admin user not found! Creating one instead...');
    // Create if not exists
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
      user_metadata: {
        username: 'admin',
        role: 'admin',
        first_name: 'System',
        last_name: 'Admin'
      }
    });
    
    if (createError) {
        console.error('Failed to create admin:', createError);
    } else {
        console.log('Admin user created successfully.');
    }
    return;
  }

  // 2. Update password
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    adminUser.id,
    { password: newPassword }
  );

  if (updateError) {
    console.error('Error updating password:', updateError);
    return;
  }

  console.log('Password reset successfully.');
  console.log('Email:', email);
  console.log('Password:', newPassword);
}

resetAdmin();
