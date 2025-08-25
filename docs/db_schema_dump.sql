

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






CREATE TYPE "public"."competitor_status" AS ENUM (
    'pending',
    'profile updated',
    'complete'
);


ALTER TYPE "public"."competitor_status" OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."calculate_competitor_status"("competitor_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    competitor_record RECORD;
    has_profile_data BOOLEAN;
    has_required_forms BOOLEAN;
BEGIN
    -- Get competitor data
    SELECT 
        is_18_or_over,
        email_personal,
        email_school,
        grade,
        gender,
        race,
        ethnicity,
        level_of_technology,
        years_competing,
        media_release_date,
        participation_agreement_date
    INTO competitor_record
    FROM competitors 
    WHERE id = competitor_id;
    
    IF NOT FOUND THEN
        RETURN 'pending';
    END IF;
    
    -- Check if all demographic fields are filled (Profile Complete)
    has_profile_data := (
        competitor_record.email_personal IS NOT NULL AND competitor_record.email_personal != '' AND
        competitor_record.email_school IS NOT NULL AND competitor_record.email_school != '' AND
        competitor_record.grade IS NOT NULL AND competitor_record.grade != '' AND
        competitor_record.gender IS NOT NULL AND competitor_record.gender != '' AND
        competitor_record.race IS NOT NULL AND competitor_record.race != '' AND
        competitor_record.ethnicity IS NOT NULL AND competitor_record.ethnicity != '' AND
        competitor_record.level_of_technology IS NOT NULL AND competitor_record.level_of_technology != '' AND
        competitor_record.years_competing IS NOT NULL
    );
    
    -- Check required forms based on age
    IF competitor_record.is_18_or_over THEN
        -- For 18+ competitors: only need participation agreement
        has_required_forms := competitor_record.participation_agreement_date IS NOT NULL;
    ELSE
        -- For under 18: need both media release and participation agreement
        has_required_forms := (
            competitor_record.media_release_date IS NOT NULL AND 
            competitor_record.participation_agreement_date IS NOT NULL
        );
    END IF;
    
    -- Determine status
    IF has_profile_data AND has_required_forms THEN
        RETURN 'complete';
    ELSIF has_profile_data THEN
        RETURN 'profile updated';
    ELSE
        RETURN 'pending';
    END IF;
END;
$$;


ALTER FUNCTION "public"."calculate_competitor_status"("competitor_id" "uuid") OWNER TO "postgres";


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
    -- Try to insert profile, but don't fail if it already exists
    INSERT INTO public.profiles (id, email, role, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'role', 'coach'),
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name'
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
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


CREATE OR REPLACE FUNCTION "public"."update_competitor_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
    NEW.status = calculate_competitor_status(NEW.id)::competitor_status;
    RETURN NEW;
END;$$;


ALTER FUNCTION "public"."update_competitor_status"() OWNER TO "postgres";


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
    "status" "public"."competitor_status" DEFAULT 'pending'::"public"."competitor_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true
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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_coach_school_email_student_id_unique" UNIQUE ("coach_id", "email_school", "game_platform_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_game_platform_id_key" UNIQUE ("game_platform_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_profile_update_token_key" UNIQUE ("profile_update_token");



ALTER TABLE ONLY "public"."game_platform_stats"
    ADD CONSTRAINT "game_platform_stats_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_competitors_coach_id" ON "public"."competitors" USING "btree" ("coach_id");



CREATE INDEX "idx_competitors_game_platform_id" ON "public"."competitors" USING "btree" ("game_platform_id");



CREATE INDEX "idx_competitors_status" ON "public"."competitors" USING "btree" ("status");



CREATE INDEX "idx_game_platform_stats_competitor_id" ON "public"."game_platform_stats" USING "btree" ("competitor_id");



CREATE INDEX "idx_team_members_competitor_id" ON "public"."team_members" USING "btree" ("competitor_id");



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id");



CREATE OR REPLACE TRIGGER "enforce_team_size" BEFORE INSERT ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_team_size"();



CREATE OR REPLACE TRIGGER "set_profile_update_token" BEFORE INSERT ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_update_token_with_expiry"();



CREATE OR REPLACE TRIGGER "trigger_update_competitor_status" BEFORE INSERT OR UPDATE ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."update_competitor_status"();



CREATE OR REPLACE TRIGGER "update_competitors_updated_at" BEFORE UPDATE ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platform_stats"
    ADD CONSTRAINT "game_platform_stats_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



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



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own activity logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own competitor stats" ON "public"."game_platform_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."competitors"
  WHERE (("competitors"."id" = "game_platform_stats"."competitor_id") AND ("competitors"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
































































































































































































































































































GRANT ALL ON FUNCTION "public"."calculate_competitor_status"("competitor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_competitor_status"("competitor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_competitor_status"("competitor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_team_size"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_team_size"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_team_size"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_competitor_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_competitor_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_competitor_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";





















GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



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



GRANT ALL ON TABLE "public"."game_platform_stats" TO "anon";
GRANT ALL ON TABLE "public"."game_platform_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."game_platform_stats" TO "service_role";



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
