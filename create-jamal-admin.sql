-- Create Admin User: Jamal
-- Login Credentials:
-- Username: jamal
-- Email: jamal@examroomedu.com
-- Password: Jamal@2026

-- Rollback any pending transaction first (ignore error if none exists)
ROLLBACK;

-- Delete user if already exists (to allow re-running)
DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE username = 'jamal' OR email = 'jamal@examroomedu.com');
DELETE FROM users WHERE username = 'jamal' OR email = 'jamal@examroomedu.com';

-- Start fresh transaction
BEGIN;

-- Generate UUID for user
-- Insert into users table with inline UUID generation
INSERT INTO users (
    id,
    email,
    username,
    first_name,
    last_name,
    role,
    email_verified,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'jamal@examroomedu.com',
    'jamal',
    'Jamal',
    'Admin',
    'admin',
    NOW(),
    NOW(),
    NOW()
) RETURNING id;

-- Note: Save the ID from above to use in the next query
-- Or use this simpler approach: insert into accounts using a subquery

-- Insert into accounts table (for password authentication)
-- This is bcrypt hash of "Jamal@2026" with salt rounds 10
INSERT INTO accounts (
    user_id,
    account_id,
    provider_id,
    password,
    created_at,
    updated_at
)
SELECT 
    id,
    'jamal@examroomedu.com',
    'credential',
    '$2b$10$xZ9K3YQHvMGPp7fN2vFZVe1qL8nK0VwXxP5mPzQk7fJ9hNpMrLzGy',
    NOW(),
    NOW()
FROM users 
WHERE username = 'jamal';

COMMIT;

-- To verify the user was created:
-- SELECT id, email, username, first_name, last_name, role FROM users WHERE username = 'jamal';
