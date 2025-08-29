-- Migration: Add manual completion fields to agreements table
-- Date: 2025-08-29
-- Purpose: Support manual document upload completion workflow

-- Add new enum type for completion source
CREATE TYPE "public"."completion_source" AS ENUM (
    'zoho',
    'manual'
);

-- Add new fields to agreements table
ALTER TABLE "public"."agreements" 
ADD COLUMN "completion_source" "public"."completion_source" DEFAULT 'zoho',
ADD COLUMN "manual_completion_reason" text DEFAULT 'Manual completion',
ADD COLUMN "manual_uploaded_path" text,
ADD COLUMN "manual_completed_at" timestamp with time zone,
ADD COLUMN "zoho_request_status" text;

-- Add comments for documentation
COMMENT ON COLUMN "public"."agreements"."completion_source" IS 'Indicates whether agreement was completed via Zoho or manual upload';
COMMENT ON COLUMN "public"."agreements"."manual_completion_reason" IS 'Reason for manual completion (default: Manual completion)';
COMMENT ON COLUMN "public"."agreements"."manual_uploaded_path" IS 'Path to manually uploaded document in Supabase Storage';
COMMENT ON COLUMN "public"."agreements"."manual_completed_at" IS 'Timestamp when manual completion occurred';
COMMENT ON COLUMN "public"."agreements"."zoho_request_status" IS 'Optional mirroring of Zoho request status for audit purposes';

-- Update existing agreements to have zoho as completion source
UPDATE "public"."agreements" 
SET "completion_source" = 'zoho' 
WHERE "completion_source" IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "agreements_completion_source_idx" ON "public"."agreements" ("completion_source");
CREATE INDEX IF NOT EXISTS "agreements_manual_completed_at_idx" ON "public"."agreements" ("manual_completed_at");

-- Add check constraint to ensure manual completion fields are populated when source is manual
ALTER TABLE "public"."agreements" 
ADD CONSTRAINT "agreements_manual_completion_check" 
CHECK (
    ("completion_source" = 'manual' AND "manual_uploaded_path" IS NOT NULL AND "manual_completed_at" IS NOT NULL) 
    OR 
    ("completion_source" = 'zoho')
);

-- Grant permissions (adjust as needed for your RLS setup)
-- Note: These will be subject to existing RLS policies
GRANT SELECT, INSERT, UPDATE ON "public"."agreements" TO authenticated;
GRANT USAGE ON TYPE "public"."completion_source" TO authenticated;
