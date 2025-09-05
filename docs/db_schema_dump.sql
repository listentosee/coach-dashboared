

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE TYPE "public"."completion_source" AS ENUM (
    'zoho',
    'manual'
);


ALTER TYPE "public"."completion_source" OWNER TO "postgres";


CREATE TYPE "public"."team_status" AS ENUM (
    'forming',
    'active',
    'archived'
);


ALTER TYPE "public"."team_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'coach'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_team_size"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >= 6 THEN
        RAISE EXCEPTION 'Team cannot have more than 6 members';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_team_size"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_profile_update_token"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;


ALTER FUNCTION "public"."generate_profile_update_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only create profile for authenticated users
  IF NEW.email IS NOT NULL THEN
    -- Try to insert profile with Monday.com data from metadata, but don't fail if it already exists
    INSERT INTO public.profiles (
      id, 
      email, 
      role, 
      full_name,
      first_name, 
      last_name,
      school_name,
      mobile_number,
      division,
      region,
      monday_coach_id,
      is_approved,
      live_scan_completed,
      mandated_reporter_completed
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'role', 'coach'),
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'fullName', ''),
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'school_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
      COALESCE(NEW.raw_user_meta_data->>'division', ''),
      COALESCE(NEW.raw_user_meta_data->>'region', ''),
      COALESCE(NEW.raw_user_meta_data->>'monday_coach_id', ''),
      COALESCE((NEW.raw_user_meta_data->>'is_approved')::boolean, true),
      COALESCE((NEW.raw_user_meta_data->>'live_scan_completed')::boolean, false),
      COALESCE((NEW.raw_user_meta_data->>'mandated_reporter_completed')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      full_name = EXCLUDED.full_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      school_name = EXCLUDED.school_name,
      mobile_number = EXCLUDED.mobile_number,
      division = EXCLUDED.division,
      region = EXCLUDED.region,
      monday_coach_id = EXCLUDED.monday_coach_id,
      is_approved = EXCLUDED.is_approved,
      live_scan_completed = EXCLUDED.live_scan_completed,
      mandated_reporter_completed = EXCLUDED.mandated_reporter_completed,
      updated_at = now();

    -- For coach users, try to link to existing coach record if it exists
    -- But don't fail if the coaches table is not accessible or coach doesn't exist
    IF COALESCE(NEW.raw_user_meta_data->>'role', 'coach') = 'coach' THEN
      BEGIN
        UPDATE public.coaches 
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE email = NEW.email AND auth_user_id IS NULL;
      EXCEPTION 
        WHEN OTHERS THEN
          -- Log the error but don't fail the user creation
          RAISE WARNING 'Could not link coach record for %: %', NEW.email, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Error in handle_new_user trigger for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Automatically creates profile records with Monday.com data when new users sign up';



CREATE OR REPLACE FUNCTION "public"."is_admin"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Check if the current user has admin role in their profile
    -- Use SECURITY DEFINER to bypass RLS
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_update_token_with_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.profile_update_token = generate_profile_update_token();
    NEW.profile_update_token_expires = NOW() + INTERVAL '30 days';
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_profile_update_token_with_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "metadata" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'zoho'::"text" NOT NULL,
    "request_id" "text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "signers" "jsonb",
    "signed_pdf_path" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "template_kind" "text" DEFAULT 'adult'::"text" NOT NULL,
    "zoho_completed" boolean DEFAULT false,
    "completion_source" "public"."completion_source" DEFAULT 'zoho'::"public"."completion_source",
    "manual_completion_reason" "text" DEFAULT 'Manual completion'::"text",
    "manual_uploaded_path" "text",
    "manual_completed_at" timestamp with time zone,
    "zoho_request_status" "text",
    CONSTRAINT "agreements_manual_completion_check" CHECK (((("completion_source" = 'manual'::"public"."completion_source") AND ("manual_uploaded_path" IS NOT NULL) AND ("manual_completed_at" IS NOT NULL)) OR ("completion_source" = 'zoho'::"public"."completion_source"))),
    CONSTRAINT "agreements_template_kind_check" CHECK (("template_kind" = ANY (ARRAY['adult'::"text", 'minor'::"text"])))
);


ALTER TABLE "public"."agreements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agreements"."zoho_completed" IS 'Indicates whether a manually completed agreement has been marked as complete in Zoho Sign';



COMMENT ON COLUMN "public"."agreements"."completion_source" IS 'Indicates whether agreement was completed via Zoho or manual upload';



COMMENT ON COLUMN "public"."agreements"."manual_completion_reason" IS 'Reason for manual completion (default: Manual completion)';



COMMENT ON COLUMN "public"."agreements"."manual_uploaded_path" IS 'Path to manually uploaded document in Supabase Storage';



COMMENT ON COLUMN "public"."agreements"."manual_completed_at" IS 'Timestamp when manual completion occurred';



COMMENT ON COLUMN "public"."agreements"."zoho_request_status" IS 'Optional mirroring of Zoho request status for audit purposes';



CREATE TABLE IF NOT EXISTS "public"."competitors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "email_personal" "text",
    "email_school" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "is_18_or_over" boolean DEFAULT false,
    "grade" "text",
    "parent_name" "text",
    "parent_email" "text",
    "gender" "text",
    "race" "text",
    "ethnicity" "text",
    "level_of_technology" "text",
    "years_competing" integer,
    "media_release_date" timestamp with time zone,
    "participation_agreement_date" timestamp with time zone,
    "adobe_sign_document_id" "text",
    "profile_update_token" "text",
    "profile_update_token_expires" timestamp with time zone,
    "game_platform_id" "text",
    "game_platform_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."competitors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "position" integer,
    CONSTRAINT "team_members_position_check" CHECK ((("position" >= 1) AND ("position" <= 6)))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "division" "text",
    "status" "public"."team_status" DEFAULT 'forming'::"public"."team_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text"
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON COLUMN "public"."teams"."image_url" IS 'URL to team image stored in Supabase Storage';



CREATE OR REPLACE VIEW "public"."comp_team_view" WITH ("security_invoker"='on') AS
 SELECT "c"."id",
    "c"."first_name",
    "c"."last_name",
    "c"."email_personal",
    "c"."email_school",
    "c"."is_18_or_over",
    "c"."grade",
    "c"."status",
    "c"."media_release_date",
    "c"."participation_agreement_date",
    "c"."game_platform_id",
    "c"."game_platform_synced_at",
    "c"."profile_update_token",
    "c"."profile_update_token_expires",
    "c"."created_at",
    "c"."is_active",
    "t"."id" AS "team_id",
    "t"."name" AS "team_name",
    "tm"."position" AS "team_position"
   FROM (("public"."competitors" "c"
     LEFT JOIN "public"."team_members" "tm" ON (("c"."id" = "tm"."competitor_id")))
     LEFT JOIN "public"."teams" "t" ON (("tm"."team_id" = "t"."id")))
  WHERE ("c"."coach_id" = "auth"."uid"());


ALTER TABLE "public"."comp_team_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "muted_until" timestamp with time zone,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['dm'::"text", 'announcement'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_platform_stats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "challenges_completed" integer DEFAULT 0,
    "monthly_ctf_challenges" integer DEFAULT 0,
    "total_score" integer DEFAULT 0,
    "last_activity" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."game_platform_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" bigint NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


ALTER TABLE "public"."messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'coach'::"public"."user_role" NOT NULL,
    "full_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "school_name" "text" NOT NULL,
    "mobile_number" "text",
    "division" "text",
    "region" "text",
    "monday_coach_id" "text",
    "is_approved" boolean DEFAULT false,
    "live_scan_completed" boolean DEFAULT false,
    "mandated_reporter_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_config" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_coach_school_email_student_id_unique" UNIQUE ("coach_id", "email_school", "game_platform_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_game_platform_id_key" UNIQUE ("game_platform_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_profile_update_token_key" UNIQUE ("profile_update_token");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_stats"
    ADD CONSTRAINT "game_platform_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_monday_coach_id_key" UNIQUE ("monday_coach_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_competitor_id_key" UNIQUE ("competitor_id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_competitor_id_key" UNIQUE ("team_id", "competitor_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_coach_id_name_key" UNIQUE ("coach_id", "name");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



CREATE INDEX "agreements_completion_source_idx" ON "public"."agreements" USING "btree" ("completion_source");



CREATE INDEX "agreements_idx1" ON "public"."agreements" USING "btree" ("competitor_id");



CREATE INDEX "agreements_idx2" ON "public"."agreements" USING "btree" ("provider", "request_id");



CREATE INDEX "agreements_manual_completed_at_idx" ON "public"."agreements" USING "btree" ("manual_completed_at");



CREATE INDEX "agreements_zoho_completed_idx" ON "public"."agreements" USING "btree" ("zoho_completed") WHERE ("zoho_completed" = false);



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_competitors_coach_id" ON "public"."competitors" USING "btree" ("coach_id");



CREATE INDEX "idx_competitors_game_platform_id" ON "public"."competitors" USING "btree" ("game_platform_id");



CREATE INDEX "idx_conversation_members_user" ON "public"."conversation_members" USING "btree" ("user_id");



CREATE INDEX "idx_game_platform_stats_competitor_id" ON "public"."game_platform_stats" USING "btree" ("competitor_id");



CREATE INDEX "idx_messages_conversation_created_at" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_team_members_competitor_id" ON "public"."team_members" USING "btree" ("competitor_id");



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "idx_teams_image_url" ON "public"."teams" USING "btree" ("image_url");



CREATE OR REPLACE TRIGGER "enforce_team_size" BEFORE INSERT ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_team_size"();



CREATE OR REPLACE TRIGGER "set_profile_update_token" BEFORE INSERT ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_update_token_with_expiry"();



CREATE OR REPLACE TRIGGER "update_competitors_updated_at" BEFORE UPDATE ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."game_platform_stats"
    ADD CONSTRAINT "game_platform_stats_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Coaches can manage own competitors" ON "public"."competitors" TO "authenticated" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can manage own team members" ON "public"."team_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage own teams" ON "public"."teams" TO "authenticated" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Users can create their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own activity logs" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own profile" ON "public"."profiles" TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own activity logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own competitor stats" ON "public"."game_platform_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."competitors"
  WHERE (("competitors"."id" = "game_platform_stats"."competitor_id") AND ("competitors"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_can_delete_competitors" ON "public"."competitors" FOR DELETE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_delete_team_members" ON "public"."team_members" FOR DELETE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_delete_teams" ON "public"."teams" FOR DELETE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_activity_logs" ON "public"."activity_logs" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_competitors" ON "public"."competitors" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_team_members" ON "public"."team_members" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_teams" ON "public"."teams" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_agreements" ON "public"."agreements" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_all_competitors" ON "public"."competitors" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_all_team_members" ON "public"."team_members" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_all_teams" ON "public"."teams" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_activity_logs" ON "public"."activity_logs" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_agreements" ON "public"."agreements" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_competitors" ON "public"."competitors" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_team_members" ON "public"."team_members" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_teams" ON "public"."teams" FOR SELECT USING ("public"."is_admin_user"());



ALTER TABLE "public"."agreements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coaches_can_update_agreements" ON "public"."agreements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."competitors" "c"
  WHERE (("c"."id" = "agreements"."competitor_id") AND ("c"."coach_id" = "auth"."uid"())))));



CREATE POLICY "coaches_can_update_own_competitors" ON "public"."competitors" FOR UPDATE USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_can_update_own_teams" ON "public"."teams" FOR UPDATE USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_can_view_agreements" ON "public"."agreements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."competitors" "c"
  WHERE (("c"."id" = "agreements"."competitor_id") AND ("c"."coach_id" = "auth"."uid"())))));



CREATE POLICY "coaches_can_view_own_competitors" ON "public"."competitors" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_can_view_own_teams" ON "public"."teams" FOR SELECT USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."competitors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_delete_admin" ON "public"."conversations" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_insert_admin" ON "public"."conversations" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_select_admin" ON "public"."conversations" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_select_member" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "m"
  WHERE (("m"."conversation_id" = "conversations"."id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversations_update_admin" ON "public"."conversations" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_delete_admin" ON "public"."conversation_members" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_insert_admin" ON "public"."conversation_members" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_select_admin" ON "public"."conversation_members" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_select_self" ON "public"."conversation_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "convo_members_update_admin" ON "public"."conversation_members" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_update_self_read" ON "public"."conversation_members" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("role" = ( SELECT "conversation_members_1"."role"
   FROM "public"."conversation_members" "conversation_members_1"
  WHERE (("conversation_members_1"."conversation_id" = "conversation_members_1"."conversation_id") AND ("conversation_members_1"."user_id" = "conversation_members_1"."user_id")))) AND (NOT ("muted_until" IS DISTINCT FROM ( SELECT "conversation_members_1"."muted_until"
   FROM "public"."conversation_members" "conversation_members_1"
  WHERE (("conversation_members_1"."conversation_id" = "conversation_members_1"."conversation_id") AND ("conversation_members_1"."user_id" = "conversation_members_1"."user_id")))))));



ALTER TABLE "public"."game_platform_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete_admin" ON "public"."messages" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "messages_insert_allowed" ON "public"."messages" FOR INSERT WITH CHECK (("public"."is_admin"("auth"."uid"()) OR ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "m"
  WHERE (("m"."conversation_id" = "messages"."conversation_id") AND ("m"."user_id" = "auth"."uid"()) AND (("m"."muted_until" IS NULL) OR ("m"."muted_until" < "now"()))))) AND (( SELECT "c"."type"
   FROM "public"."conversations" "c"
  WHERE ("c"."id" = "messages"."conversation_id")) = 'dm'::"text"))));



CREATE POLICY "messages_select_admin" ON "public"."messages" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "messages_select_member" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "m"
  WHERE (("m"."conversation_id" = "m"."conversation_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages_update_admin" ON "public"."messages" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full_access" ON "public"."agreements" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TYPE "public"."completion_source" TO "authenticated";
































































































































































































































































































GRANT ALL ON FUNCTION "public"."check_team_size"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_team_size"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_team_size"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";





















GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."agreements" TO "anon";
GRANT ALL ON TABLE "public"."agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."agreements" TO "service_role";



GRANT ALL ON TABLE "public"."competitors" TO "anon";
GRANT ALL ON TABLE "public"."competitors" TO "authenticated";
GRANT ALL ON TABLE "public"."competitors" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."comp_team_view" TO "anon";
GRANT ALL ON TABLE "public"."comp_team_view" TO "authenticated";
GRANT ALL ON TABLE "public"."comp_team_view" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_members" TO "anon";
GRANT ALL ON TABLE "public"."conversation_members" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."game_platform_stats" TO "anon";
GRANT ALL ON TABLE "public"."game_platform_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."game_platform_stats" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."system_config" TO "anon";
GRANT ALL ON TABLE "public"."system_config" TO "authenticated";
GRANT ALL ON TABLE "public"."system_config" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
