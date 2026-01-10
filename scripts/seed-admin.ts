
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

async function seedAdmin() {
  console.log('Checking for existing admin...');

  const { data: existingAdmins, error: searchError } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'admin');

  if (searchError) {
    console.error('Error searching for admin:', searchError);
    return;
  }

  if (existingAdmins && existingAdmins.length > 0) {
    console.log('Admin already exists:', existingAdmins[0].username);
    return;
  }

  console.log('Creating default admin...');

  const username = 'admin';
  const password = 'adminPassword123!';
  const email = 'admin@sat-platform.local';

  // 1. Create Auth User
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      role: 'admin',
      first_name: 'System',
      last_name: 'Admin'
    }
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    return;
  }

  console.log('Admin created successfully.');
  console.log('Username:', username);
  console.log('Password:', password);
  // Note: public.users should be populated by the trigger if it exists and works.
  // If not, we might need to insert manually.
}

seedAdmin();
