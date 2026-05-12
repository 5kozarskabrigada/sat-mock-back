// Script to migrate existing Supabase Storage images to Neon PostgreSQL
// Run: npx ts-node scripts/migrate-images-from-supabase.ts

import { Pool } from 'pg';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrateImages() {
  console.log('🔄 Starting migration of images from Supabase to Neon...\n');

  try {
    // Step 1: Find all questions with Supabase image URLs
    console.log('📊 Step 1: Finding questions with Supabase images...');
    const questionsResult = await pool.query(
      `SELECT id, question_image_url, question_text 
       FROM questions 
       WHERE question_image_url IS NOT NULL 
       AND question_image_url != ''
       AND (
         question_image_url LIKE '%supabase.co%' 
         OR question_image_url LIKE '%supabase.in%'
       )
       ORDER BY created_at DESC`
    );

    const questions = questionsResult.rows;
    console.log(`   Found ${questions.length} questions with Supabase images\n`);

    if (questions.length === 0) {
      console.log('✅ No Supabase images to migrate!');
      return;
    }

    // Step 2: Migrate each image
    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ questionId: string; error: string }> = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const progress = `[${i + 1}/${questions.length}]`;

      try {
        console.log(`${progress} Migrating image for question ${question.id}...`);
        console.log(`   Old URL: ${question.question_image_url}`);

        // Download image from Supabase
        const response = await fetch(question.question_image_url);
        if (!response.ok) {
          throw new Error(`Failed to download: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        // Extract filename from URL or generate new one
        const urlPath = new URL(question.question_image_url).pathname;
        const originalFilename = path.basename(urlPath);
        const extension = path.extname(originalFilename) || '.jpg';
        const filename = `migrated_${question.id}_${Date.now()}${extension}`;

        console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB`);
        console.log(`   Type: ${contentType}`);

        // Insert into images table
        const insertResult = await pool.query(
          `INSERT INTO images (filename, content_type, file_size, data) 
           VALUES ($1, $2, $3, $4) 
           RETURNING id`,
          [filename, contentType, buffer.length, buffer]
        );

        const newImageId = insertResult.rows[0].id;
        const newImageUrl = `https://examroomedu.com/1/api/images/${newImageId}`;

        // Update question with new URL
        await pool.query(
          `UPDATE questions 
           SET question_image_url = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [newImageUrl, question.id]
        );

        console.log(`   ✅ New URL: ${newImageUrl}\n`);
        successCount++;

      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}\n`);
        failCount++;
        errors.push({
          questionId: question.id,
          error: error.message,
        });
      }

      // Add a small delay to avoid overwhelming the servers
      if (i < questions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('Migration Summary');
    console.log('========================================');
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total processed: ${questions.length}\n`);

    if (errors.length > 0) {
      console.log('Failed migrations:');
      errors.forEach(err => {
        console.log(`   - Question ${err.questionId}: ${err.error}`);
      });
      console.log('');
    }

    // Verify migration
    console.log('🔍 Verification: Checking remaining Supabase URLs...');
    const remainingResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM questions 
       WHERE question_image_url IS NOT NULL 
       AND (question_image_url LIKE '%supabase.co%' OR question_image_url LIKE '%supabase.in%')`
    );
    
    const remaining = parseInt(remainingResult.rows[0].count);
    console.log(`   Remaining Supabase URLs: ${remaining}\n`);

    if (remaining === 0 && failCount === 0) {
      console.log('🎉 All images successfully migrated to Neon!');
    } else if (remaining > 0) {
      console.log('⚠️  Some images still point to Supabase. You may want to re-run this script.');
    }

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrateImages().catch(console.error);
