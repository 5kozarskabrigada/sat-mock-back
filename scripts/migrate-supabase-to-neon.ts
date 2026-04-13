import { Pool, PoolClient } from 'pg';
import { config } from 'dotenv';

config();

const sourceUrl = process.env.SUPABASE_DB_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error('Missing SUPABASE_DB_URL in environment.');
  process.exit(1);
}

if (!targetUrl) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

const SOURCE_TABLES = [
  'users',
  'classrooms',
  'student_classrooms',
  'exams',
  'questions',
  'student_exams',
  'student_answers',
  'activity_logs',
  'accounts',
  'sessions',
  'verifications',
];

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function tableExists(client: PoolClient, schema: string, table: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      ) AS exists
    `,
    [schema, table],
  );
  return Boolean(result.rows[0]?.exists);
}

async function getColumns(client: PoolClient, schema: string, table: string): Promise<string[]> {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, table],
  );

  return result.rows.map((r) => r.column_name as string);
}

async function readRows(client: PoolClient, schema: string, table: string, columns: string[]): Promise<any[]> {
  if (columns.length === 0) {
    return [];
  }

  const columnsSql = columns.map(quoteIdent).join(', ');
  const sql = `SELECT ${columnsSql} FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
  const result = await client.query(sql);
  return result.rows;
}

async function upsertRows(
  client: PoolClient,
  schema: string,
  table: string,
  columns: string[],
  rows: any[],
): Promise<number> {
  if (columns.length === 0 || rows.length === 0) {
    return 0;
  }

  const idIndex = columns.indexOf('id');
  if (idIndex === -1) {
    console.log(`Skipping ${table}: no id column found for upsert.`);
    return 0;
  }

  const columnsSql = columns.map(quoteIdent).join(', ');
  const updateColumns = columns.filter((c) => c !== 'id');
  const updateSql = updateColumns.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ');
  const baseSql = `
    INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${columnsSql})
    VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
    ON CONFLICT (${quoteIdent('id')}) DO UPDATE
    SET ${updateSql}
  `;

  let migrated = 0;
  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    await client.query(baseSql, values);
    migrated += 1;
  }

  return migrated;
}

async function migratePublicTable(source: PoolClient, target: PoolClient, table: string): Promise<void> {
  const sourceExists = await tableExists(source, 'public', table);
  const targetExists = await tableExists(target, 'public', table);

  if (!sourceExists || !targetExists) {
    console.log(`Skipping public.${table}: table missing in ${!sourceExists ? 'source' : 'target'}.`);
    return;
  }

  const sourceColumns = await getColumns(source, 'public', table);
  const targetColumns = await getColumns(target, 'public', table);
  const sharedColumns = sourceColumns.filter((c) => targetColumns.includes(c));

  if (sharedColumns.length === 0) {
    console.log(`Skipping public.${table}: no shared columns.`);
    return;
  }

  const rows = await readRows(source, 'public', table, sharedColumns);
  const migrated = await upsertRows(target, 'public', table, sharedColumns, rows);
  console.log(`Migrated ${migrated} rows into public.${table}`);
}

async function migrateAuthUsers(source: PoolClient, target: PoolClient): Promise<void> {
  const authUsersExists = await tableExists(source, 'auth', 'users');
  if (!authUsersExists) {
    console.log('Skipping auth.users migration: source auth.users not found.');
    return;
  }

  const targetUsersExists = await tableExists(target, 'public', 'users');
  const targetAccountsExists = await tableExists(target, 'public', 'accounts');
  if (!targetUsersExists || !targetAccountsExists) {
    console.log('Skipping auth.users migration: target public.users or public.accounts missing.');
    return;
  }

  const authUsers = await source.query(
    `
      SELECT
        id,
        email,
        encrypted_password,
        created_at,
        updated_at,
        raw_user_meta_data
      FROM auth.users
      WHERE email IS NOT NULL
    `,
  );

  let usersUpserted = 0;
  let accountsUpserted = 0;

  for (const row of authUsers.rows) {
    const metadata = (row.raw_user_meta_data || {}) as Record<string, unknown>;
    const username =
      typeof metadata.username === 'string' && metadata.username.trim().length > 0
        ? metadata.username.trim()
        : String(row.email).split('@')[0];
    const firstName = typeof metadata.first_name === 'string' ? metadata.first_name : null;
    const lastName = typeof metadata.last_name === 'string' ? metadata.last_name : null;
    const role = metadata.role === 'admin' ? 'admin' : 'student';

    await target.query(
      `
        INSERT INTO public.users (
          id, email, username, first_name, last_name, role, name, email_verified, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, COALESCE($8, NOW()), COALESCE($9, NOW()))
        ON CONFLICT (id) DO UPDATE
        SET
          email = EXCLUDED.email,
          username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          role = EXCLUDED.role,
          name = EXCLUDED.name,
          email_verified = true,
          updated_at = NOW()
      `,
      [
        row.id,
        row.email,
        username,
        firstName,
        lastName,
        role,
        `${firstName || ''} ${lastName || ''}`.trim() || username,
        row.created_at,
        row.updated_at,
      ],
    );
    usersUpserted += 1;

    if (row.encrypted_password) {
      await target.query(
        `
          INSERT INTO public.accounts (
            id,
            user_id,
            account_id,
            provider_id,
            password,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, 'credential', $4, COALESCE($5, NOW()), COALESCE($6, NOW()))
          ON CONFLICT (id) DO UPDATE
          SET
            user_id = EXCLUDED.user_id,
            account_id = EXCLUDED.account_id,
            provider_id = EXCLUDED.provider_id,
            password = EXCLUDED.password,
            updated_at = NOW()
        `,
        [
          `cred_${row.id}`,
          row.id,
          row.email,
          row.encrypted_password,
          row.created_at,
          row.updated_at,
        ],
      );
      accountsUpserted += 1;
    }
  }

  console.log(`Auth migration upserted ${usersUpserted} users and ${accountsUpserted} credential accounts.`);
}

async function main() {
  const sourcePool = new Pool({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false },
  });

  const targetPool = new Pool({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
  });

  const source = await sourcePool.connect();
  const target = await targetPool.connect();

  try {
    console.log('Starting Supabase -> Neon migration...');
    await target.query('BEGIN');

    await migrateAuthUsers(source, target);

    for (const table of SOURCE_TABLES) {
      await migratePublicTable(source, target, table);
    }

    await target.query('COMMIT');
    console.log('Migration finished successfully.');
  } catch (error) {
    await target.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    source.release();
    target.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main();