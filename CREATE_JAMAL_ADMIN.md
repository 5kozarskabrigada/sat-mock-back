# Create Admin User: Jamal

## Login Credentials

```
Username: jamal
Email:    jamal@examroomedu.com
Password: Jamal@2026
Role:     admin
```

## Option 1: Run SQL Script (Fastest)

Execute the SQL file directly in your Neon database:

```bash
# If you have psql installed:
psql "YOUR_DATABASE_URL" -f create-jamal-admin.sql

# Or copy the contents of create-jamal-admin.sql and paste into Neon SQL Editor
```

## Option 2: Run TypeScript Script

```bash
cd api
npm run ts-node scripts/create-jamal-admin.ts
```

## Verify User Was Created

After running either option, verify the user exists:

```sql
SELECT id, email, username, first_name, last_name, role 
FROM users 
WHERE username = 'jamal';
```

## Login

You can now login with:
- **Username**: `jamal` 
- **Password**: `Jamal@2026`

⚠️ **Important**: Change the password after first login!
