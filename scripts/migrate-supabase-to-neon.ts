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
  'classrooms',
  'student_classrooms',
  'exams',
  'questions',
  'student_exams',
  'student_answers',
  'activity_logs',
  'sessions',
  'verifications',
];

const TARGET_RESET_TABLES = [
  'activity_logs',
  'student_answers',
  'student_exams',
  'questions',
  'exams',
  'student_classrooms',
  'classrooms',
  'accounts',
  'sessions',
  'verifications',
  'users',
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

async function getColumnTypes(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<Record<string, string>> {
  const result = await client.query(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `,
    [schema, table],
  );

  return Object.fromEntries(
    result.rows.map((row) => [row.column_name as string, row.data_type as string]),
  );
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

  const targetUserColumns = await getColumnTypes(target, 'public', 'users');
  const targetAccountColumns = await getColumnTypes(target, 'public', 'accounts');

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

    const userRecord: Record<string, unknown> = {
      id: row.id,
      email: row.email,
      username,
      first_name: firstName,
      last_name: lastName,
      role,
      name: `${firstName || ''} ${lastName || ''}`.trim() || username,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    if ('email_verified' in targetUserColumns) {
      userRecord.email_verified = targetUserColumns.email_verified === 'boolean'
        ? true
        : row.updated_at || row.created_at || new Date();
    }

    if ('password_hash' in targetUserColumns) {
      userRecord.password_hash = row.encrypted_password;
    }

    const userColumns = Object.keys(userRecord).filter((column) => column in targetUserColumns);
    await upsertRows(target, 'public', 'users', userColumns, [userRecord]);
    usersUpserted += 1;

    if (row.encrypted_password) {
      const accountRecord: Record<string, unknown> = {
        id: targetAccountColumns.id === 'uuid' ? row.id : `cred_${row.id}`,
        user_id: row.id,
        account_id: row.email,
        provider_id: 'credential',
        password: row.encrypted_password,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      const accountColumns = Object.keys(accountRecord).filter((column) => column in targetAccountColumns);
      await upsertRows(target, 'public', 'accounts', accountColumns, [accountRecord]);
      accountsUpserted += 1;
    }
  }

  console.log(`Auth migration upserted ${usersUpserted} users and ${accountsUpserted} credential accounts.`);
}

async function resetTargetTables(target: PoolClient): Promise<void> {
  const existingTables: string[] = [];

  for (const table of TARGET_RESET_TABLES) {
    if (await tableExists(target, 'public', table)) {
      existingTables.push(`${quoteIdent('public')}.${quoteIdent(table)}`);
    }
  }

  if (existingTables.length === 0) {
    return;
  }

  await target.query(`TRUNCATE TABLE ${existingTables.join(', ')} CASCADE`);
  console.log(`Cleared target tables: ${existingTables.join(', ')}`);
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

    await resetTargetTables(target);

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