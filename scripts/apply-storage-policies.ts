
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyStoragePolicies() {
  console.log('Applying storage policies for exam-images bucket...\n');

  // Drop and recreate policies using Supabase RPC
  const queries = [
    // Drop existing policies (ignore errors if they don't exist)
    `DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects`,
    `DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects`,
    `DROP POLICY IF EXISTS "Allow public read access" ON storage.objects`,
    `DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects`,
    `DROP POLICY IF EXISTS "authenticated_uploads" ON storage.objects`,
    `DROP POLICY IF EXISTS "public_read" ON storage.objects`,
    `DROP POLICY IF EXISTS "exam-images_insert_policy" ON storage.objects`,
    `DROP POLICY IF EXISTS "exam-images_select_policy" ON storage.objects`,
    `DROP POLICY IF EXISTS "exam-images_update_policy" ON storage.objects`,
    `DROP POLICY IF EXISTS "exam-images_delete_policy" ON storage.objects`,
    
    // Create new policies
    `CREATE POLICY "exam-images_insert_policy" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'exam-images')`,
    `CREATE POLICY "exam-images_update_policy" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'exam-images') WITH CHECK (bucket_id = 'exam-images')`,
    `CREATE POLICY "exam-images_select_policy" ON storage.objects FOR SELECT TO public USING (bucket_id = 'exam-images')`,
    `CREATE POLICY "exam-images_delete_policy" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'exam-images')`,
  ];

  for (const query of queries) {
    console.log(`Executing: ${query.substring(0, 60)}...`);
    const { error } = await supabase.rpc('exec_sql', { sql: query }).single();
    
    if (error) {
      // Try direct query if RPC doesn't work
      const { error: directError } = await supabase.from('_temp').select().limit(0);
      console.log(`   Note: RPC may not be available, policies may need manual application`);
    } else {
      console.log('   Done');
    }
  }

  console.log('\n=== Policy Application Complete ===\n');
  console.log('If policies fail to apply via script, apply them manually in Supabase Dashboard:');
  console.log('1. Go to Storage > Policies');
  console.log('2. Select "exam-images" bucket');
  console.log('3. Add the following policies:\n');
  console.log('   INSERT (authenticated users):');
  console.log('     WITH CHECK (bucket_id = \'exam-images\')\n');
  console.log('   SELECT (public - anyone):');
  console.log('     USING (bucket_id = \'exam-images\')\n');
  console.log('   UPDATE (authenticated users):');
  console.log('     USING (bucket_id = \'exam-images\')');
  console.log('     WITH CHECK (bucket_id = \'exam-images\')\n');
  console.log('   DELETE (authenticated users):');
  console.log('     USING (bucket_id = \'exam-images\')');
}

applyStoragePolicies().catch(console.error);
