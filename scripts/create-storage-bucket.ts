
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createStorageBucket() {
  const bucketName = 'exam-images';
  
  console.log(`Checking if bucket "${bucketName}" exists...`);

  // List all buckets
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('Error listing buckets:', listError);
    return;
  }

  const bucketExists = buckets?.some(bucket => bucket.name === bucketName);

  if (bucketExists) {
    console.log(`Bucket "${bucketName}" already exists.`);
  } else {
    console.log(`Creating bucket "${bucketName}"...`);

    const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    });

    if (createError) {
      console.error('Error creating bucket:', createError);
      return;
    }

    console.log(`Bucket "${bucketName}" created successfully!`);
  }

  // Update bucket to ensure it's public
  console.log('Ensuring bucket is public...');
  const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
    public: true
  });

  if (updateError) {
    console.error('Error updating bucket:', updateError);
  } else {
    console.log('Bucket is now public.');
  }

  console.log('\n--- Storage Bucket Setup Complete ---');
  console.log(`Bucket URL: ${supabaseUrl}/storage/v1/object/public/${bucketName}/`);
  console.log('\nNote: RLS policies are configured via SQL migrations.');
  console.log('If uploads still fail, check these SQL policies:');
  console.log('1. Allow authenticated uploads');
  console.log('2. Allow public read access');
  console.log('\nTo manually set policies in Supabase Dashboard:');
  console.log('1. Go to Storage > Policies');
  console.log(`2. Select "${bucketName}" bucket`);
  console.log('3. Add policy for INSERT (authenticated users)');
  console.log('4. Add policy for SELECT (public/anon)');
}

createStorageBucket().catch(console.error);
