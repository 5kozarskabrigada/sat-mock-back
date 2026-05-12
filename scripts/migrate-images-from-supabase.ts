// Script to migrate existing Supabase Storage images to Neon PostgreSQL.
// Handles both questions.question_image_url and URLs nested in questions.content JSON.
// Run: npx ts-node scripts/migrate-images-from-supabase.ts

import { Pool } from 'pg';
import { config } from 'dotenv';
import * as path from 'path';

config();

const BASE_IMAGE_URL = 'https://examroomedu.com/1/api/images';
const SUPABASE_PATTERN = /https?:\/\/[^\s"')]+supabase[^\s"')]+/gi;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function extractSupabaseUrlsFromString(input: string): string[] {
  const matches = input.match(SUPABASE_PATTERN) || [];
  return [...new Set(matches)];
}

function collectUrlsFromJson(node: unknown, found: Set<string>): void {
  if (typeof node === 'string') {
    const urls = extractSupabaseUrlsFromString(node);
    urls.forEach((url) => found.add(url));
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectUrlsFromJson(child, found));
    return;
  }

  if (node && typeof node === 'object') {
    Object.values(node).forEach((child) => collectUrlsFromJson(child, found));
  }
}

function replaceUrlsInJson(node: unknown, urlMap: Map<string, string>): unknown {
  if (typeof node === 'string') {
    let replaced = node;
    for (const [oldUrl, newUrl] of urlMap.entries()) {
      replaced = replaced.split(oldUrl).join(newUrl);
    }
    return replaced;
  }

  if (Array.isArray(node)) {
    return node.map((child) => replaceUrlsInJson(child, urlMap));
  }

  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = replaceUrlsInJson(value, urlMap);
    }
    return out;
  }

  return node;
}

async function uploadUrlToNeon(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const urlPath = new URL(url).pathname;
  const originalFilename = path.basename(urlPath);
  const extension = path.extname(originalFilename) || '.jpg';
  const filename = `migrated_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`;

  const insertResult = await pool.query(
    `INSERT INTO images (filename, content_type, file_size, data)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [filename, contentType, buffer.length, buffer],
  );

  const newId = insertResult.rows[0].id;
  return `${BASE_IMAGE_URL}/${newId}`;
}

async function migrateImages() {
  console.log('Starting Supabase -> Neon image migration...\n');

  const globalUrlMap = new Map<string, string>();
  let migratedUrls = 0;
  let questionUpdates = 0;
  const errors: Array<{ questionId: string; error: string }> = [];

  try {
    console.log('Step 1: Loading candidate questions...');
    const questionsResult = await pool.query(
      `SELECT id, question_image_url, content
       FROM questions
       WHERE (
         question_image_url ILIKE '%supabase%'
         OR content::text ILIKE '%supabase%'
       )
       ORDER BY created_at DESC`,
    );

    const questions = questionsResult.rows as Array<{
      id: string;
      question_image_url: string | null;
      content: unknown;
    }>;

    console.log(`Found ${questions.length} questions with Supabase references.\n`);

    if (questions.length === 0) {
      console.log('No Supabase image URLs found.');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const questionUrlMap = new Map<string, string>();
      const progress = `[${i + 1}/${questions.length}]`;

      try {
        const foundUrls = new Set<string>();

        if (q.question_image_url && q.question_image_url.toLowerCase().includes('supabase')) {
          foundUrls.add(q.question_image_url);
        }

        collectUrlsFromJson(q.content, foundUrls);

        if (foundUrls.size === 0) {
          continue;
        }

        console.log(`${progress} Question ${q.id}: ${foundUrls.size} URL(s) to migrate`);

        for (const oldUrl of foundUrls) {
          const cached = globalUrlMap.get(oldUrl);
          if (cached) {
            questionUrlMap.set(oldUrl, cached);
            continue;
          }

          const newUrl = await uploadUrlToNeon(oldUrl, `question ${q.id}`);
          globalUrlMap.set(oldUrl, newUrl);
          questionUrlMap.set(oldUrl, newUrl);
          migratedUrls++;
          console.log(`  Migrated URL -> ${newUrl}`);
        }

        const nextQuestionImageUrl = q.question_image_url
          ? (questionUrlMap.get(q.question_image_url) || q.question_image_url)
          : null;
        const nextContent = replaceUrlsInJson(q.content, questionUrlMap);

        await pool.query(
          `UPDATE questions
           SET question_image_url = $1,
               content = $2::jsonb,
               updated_at = NOW()
           WHERE id = $3`,
          [nextQuestionImageUrl, JSON.stringify(nextContent), q.id],
        );

        questionUpdates++;
      } catch (error: any) {
        errors.push({ questionId: q.id, error: error.message || 'Unknown error' });
        console.error(`${progress} Failed question ${q.id}: ${error.message || error}`);
      }
    }

    const remaining = await pool.query(
      `SELECT COUNT(*) AS count
       FROM questions
       WHERE question_image_url ILIKE '%supabase%'
          OR content::text ILIKE '%supabase%'`,
    );

    console.log('\n========================================');
    console.log('Migration Summary');
    console.log('========================================');
    console.log(`Questions updated: ${questionUpdates}`);
    console.log(`Unique URLs migrated: ${migratedUrls}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Remaining questions with Supabase refs: ${remaining.rows[0].count}`);

    if (errors.length > 0) {
      console.log('\nFailed question IDs:');
      errors.forEach((e) => console.log(`- ${e.questionId}: ${e.error}`));
    }
  } catch (error: any) {
    console.error('Migration failed:', error.message || error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateImages().catch(console.error);
