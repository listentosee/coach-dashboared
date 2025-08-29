-- Check admin user role and test is_admin_user function
-- Run this in your Supabase dashboard SQL editor

-- Check the admin user's role in profiles table
SELECT id, email, role, full_name 
FROM profiles 
WHERE email = 'syoung@jsyphoto.com';

-- Check the admin user's role in auth.users
SELECT *
FROM auth.users 
WHERE email = 'syoung@jsyphoto.com';

-- Test the is_admin_user function
SELECT is_admin_user();

-- Check if the function exists and is working
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'is_admin_user';

-- Check current user context
SELECT auth.uid() as current_user_id, auth.role() as current_user_role;

-- Direct check of admin user role (bypass auth.uid())
SELECT 
    p.id,
    p.email,
    p.role,
    p.full_name,
    CASE WHEN p.role = 'admin' THEN 'IS_ADMIN' ELSE 'NOT_ADMIN' END as admin_status
FROM profiles p
WHERE p.email = 'syoung@jsyphoto.com';
