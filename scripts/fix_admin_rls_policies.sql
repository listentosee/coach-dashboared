-- Fix admin RLS policies using the is_admin_user() function
-- This approach avoids JWT claim issues and recursion problems

-- Drop the problematic admin policies
DROP POLICY IF EXISTS "admins_can_view_all_profiles" ON "public"."profiles";
DROP POLICY IF EXISTS "admins_can_view_all_agreements" ON "public"."agreements";
DROP POLICY IF EXISTS "admins_can_update_agreements" ON "public"."agreements";

-- Create policies using the is_admin_user() function
-- This function bypasses RLS and directly checks the profiles table

CREATE POLICY "admins_can_view_all_profiles" ON "public"."profiles"
    FOR SELECT USING (is_admin_user());

CREATE POLICY "admins_can_view_all_agreements" ON "public"."agreements"
    FOR SELECT USING (is_admin_user());

CREATE POLICY "admins_can_update_agreements" ON "public"."agreements"
    FOR UPDATE USING (is_admin_user());

-- Also ensure regular users can still access their own data
-- Drop existing policies first, then recreate them

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON "public"."profiles";
CREATE POLICY "Users can view own profile" ON "public"."profiles"
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile  
DROP POLICY IF EXISTS "Users can update own profile" ON "public"."profiles";
CREATE POLICY "Users can update own profile" ON "public"."profiles"
    FOR UPDATE USING (auth.uid() = id);

-- Coaches can view their own competitors
DROP POLICY IF EXISTS "coaches_can_view_own_competitors" ON "public"."competitors";
CREATE POLICY "coaches_can_view_own_competitors" ON "public"."competitors"
    FOR SELECT USING (coach_id = auth.uid());

-- Coaches can update their own competitors
DROP POLICY IF EXISTS "coaches_can_update_own_competitors" ON "public"."competitors";
CREATE POLICY "coaches_can_update_own_competitors" ON "public"."competitors"
    FOR UPDATE USING (coach_id = auth.uid());

-- Coaches can view their own teams
DROP POLICY IF EXISTS "coaches_can_view_own_teams" ON "public"."teams";
CREATE POLICY "coaches_can_view_own_teams" ON "public"."teams"
    FOR SELECT USING (coach_id = auth.uid());

-- Coaches can update their own teams
DROP POLICY IF EXISTS "coaches_can_update_own_teams" ON "public"."teams";
CREATE POLICY "coaches_can_update_own_teams" ON "public"."teams"
    FOR UPDATE USING (coach_id = auth.uid());
