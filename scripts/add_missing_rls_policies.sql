-- Add missing RLS policies for competitor profile updates and activity logging

-- 1. Allow competitors to READ their own profile using secret token
CREATE POLICY "Competitors can read own profile with token" ON "public"."competitors"
    FOR SELECT TO "authenticated"
    USING (
        "profile_update_token" IS NOT NULL 
        AND "profile_update_token_expires" > NOW()
    );

-- 2. Allow competitors to UPDATE their own profile using secret token
CREATE POLICY "Competitors can update own profile with token" ON "public"."competitors"
    FOR UPDATE TO "authenticated"
    USING (
        -- Check if the competitor has a valid profile_update_token
        "profile_update_token" IS NOT NULL 
        AND "profile_update_token_expires" > NOW()
    )
    WITH CHECK (
        -- Ensure the token is still valid during the update
        "profile_update_token" IS NOT NULL 
        AND "profile_update_token_expires" > NOW()
    );

-- 2. Allow all authenticated users to insert activity logs for audit trail
CREATE POLICY "Users can insert own activity logs" ON "public"."activity_logs"
    FOR INSERT TO "authenticated"
    WITH CHECK ("auth"."uid"() = "user_id");

-- Note: The existing SELECT policy already allows users to view their own activity logs
-- The new INSERT policy completes the audit trail functionality
