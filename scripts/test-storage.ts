
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

async function testStorageUpload() {
  const bucketName = 'exam-images';
  
  console.log('=== Storage Upload Test ===\n');

  // Test 1: List bucket contents
  console.log('1. Listing bucket contents...');
  const { data: files, error: listError } = await supabase.storage
    .from(bucketName)
    .list('', { limit: 10 });

  if (listError) {
    console.error('   ERROR listing files:', listError);
  } else {
    console.log(`   Found ${files?.length || 0} files in bucket`);
    if (files && files.length > 0) {
      console.log('   Sample files:', files.slice(0, 3).map(f => f.name).join(', '));
    }
  }

  // Test 2: Upload a test image (creating a simple PNG)
  console.log('\n2. Testing upload...');
  const testFileName = `test_${Date.now()}.txt`;
  const testContent = 'This is a test file for storage validation.';
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`tests/${testFileName}`, testContent, {
      contentType: 'text/plain',
      upsert: false
    });

  if (uploadError) {
    console.error('   ERROR uploading:', uploadError);
    console.error('   Error message:', uploadError.message);
    
    // Check specific error types
    if (uploadError.message.includes('row-level security')) {
      console.log('\n   >>> DIAGNOSIS: RLS policies are blocking uploads.');
      console.log('   >>> Run the SQL migration to fix storage policies.');
    } else if (uploadError.message.includes('Bucket not found')) {
      console.log('\n   >>> DIAGNOSIS: Bucket does not exist.');
      console.log('   >>> Run: npx ts-node scripts/create-storage-bucket.ts');
    }
  } else {
    console.log('   Upload successful!');
    console.log('   Uploaded to:', uploadData?.path);

    // Test 3: Get public URL
    console.log('\n3. Getting public URL...');
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(`tests/${testFileName}`);
    
    console.log('   Public URL:', urlData.publicUrl);

    // Test 4: Download/verify file
    console.log('\n4. Verifying file is accessible...');
    try {
      const response = await fetch(urlData.publicUrl);
      if (response.ok) {
        console.log('   File is publicly accessible! Status:', response.status);
      } else {
        console.error('   File NOT accessible. Status:', response.status);
      }
    } catch (fetchErr) {
      console.error('   Error fetching file:', fetchErr);
    }

    // Clean up test file
    console.log('\n5. Cleaning up test file...');
    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove([`tests/${testFileName}`]);
    
    if (deleteError) {
      console.error('   Error deleting test file:', deleteError);
    } else {
      console.log('   Test file cleaned up.');
    }
  }

  console.log('\n=== Test Complete ===');
}

testStorageUpload().catch(console.error);
