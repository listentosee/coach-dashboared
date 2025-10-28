-- =============================================================================
-- COMPREHENSIVE SEED DATA FOR LOCAL DEVELOPMENT
-- =============================================================================
-- This seed file creates realistic test data covering edge cases developers
-- need to test against. Run after migrations: supabase db reset
--
-- Data includes:
-- - Multiple coaches (admin, approved, pending)
-- - Competitors (various ages, statuses, with/without agreements)
-- - Teams (forming, active, archived)
-- - Game platform sync data (pending, synced, errors)
-- - Parental agreements (pending, completed via Zoho, manual upload)
-- - Conversations (DM, group, announcement)
-- - Challenge solves and stats
-- =============================================================================

-- Clean existing test data (in case of re-seeding)
DELETE FROM public.message_read_receipts WHERE true;
DELETE FROM public.messages WHERE true;
DELETE FROM public.conversation_members WHERE true;
DELETE FROM public.conversations WHERE true;
DELETE FROM public.game_platform_challenge_solves WHERE true;
DELETE FROM public.game_platform_flash_ctf_events WHERE true;
DELETE FROM public.game_platform_sync_state WHERE true;
DELETE FROM public.game_platform_stats WHERE true;
DELETE FROM public.team_members WHERE true;
DELETE FROM public.teams WHERE true;
DELETE FROM public.agreements WHERE true;
DELETE FROM public.game_platform_profiles WHERE true;
DELETE FROM public.competitors WHERE true;
DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);

-- Temporarily disable user creation triggers (e.g., handle_new_user) to avoid enum casting issues
SET session_replication_role = 'replica';

-- =============================================================================
-- AUTH USERS & PROFILES
-- =============================================================================
-- Create test auth users with predictable passwords for local dev
-- Password for all test users: "TestPassword123!"
-- Hash generated with: SELECT crypt('TestPassword123!', gen_salt('bf'))

-- Admin user
INSERT INTO auth.users (
  id, 
  email, 
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'admin@test.com',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"role": "admin", "first_name": "Admin", "last_name": "User", "school_name": "IE Mayors Cup HQ"}'::jsonb,
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  aud = EXCLUDED.aud,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- Approved coach with active students
INSERT INTO auth.users (
  id, 
  email, 
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'coach.active@test.com',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"role": "coach", "first_name": "Sarah", "last_name": "Johnson", "school_name": "Valley High School", "division": "high_school", "region": "Riverside", "is_approved": true, "live_scan_completed": true, "mandated_reporter_completed": true}'::jsonb,
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  aud = EXCLUDED.aud,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- Pending approval coach
INSERT INTO auth.users (
  id, 
  email, 
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000003'::uuid,
  'coach.pending@test.com',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"role": "coach", "first_name": "Mike", "last_name": "Chen", "school_name": "Desert View Middle School", "division": "middle_school", "region": "San Bernardino", "is_approved": false, "live_scan_completed": false, "mandated_reporter_completed": false}'::jsonb,
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  aud = EXCLUDED.aud,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- Coach with college students
INSERT INTO auth.users (
  id, 
  email, 
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000004'::uuid,
  'coach.college@test.com',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"role": "coach", "first_name": "Dr. Elena", "last_name": "Martinez", "school_name": "California State University SB", "division": "college", "region": "San Bernardino", "is_approved": true, "live_scan_completed": true, "mandated_reporter_completed": true}'::jsonb,
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  aud = EXCLUDED.aud,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- Re-enable triggers now that auth users are seeded
SET session_replication_role = 'origin';

-- Ensure corresponding profiles exist with correct enum casting
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
) VALUES
  (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'admin@test.com',
    'admin'::public.user_role,
    'Admin User',
    'Admin',
    'User',
    'IE Mayors Cup HQ',
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002'::uuid,
    'coach.active@test.com',
    'coach'::public.user_role,
    'Sarah Johnson',
    'Sarah',
    'Johnson',
    'Valley High School',
    NULL,
    'high_school',
    'Riverside',
    NULL,
    true,
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000003'::uuid,
    'coach.pending@test.com',
    'coach'::public.user_role,
    'Mike Chen',
    'Mike',
    'Chen',
    'Desert View Middle School',
    NULL,
    'middle_school',
    'San Bernardino',
    NULL,
    false,
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000004'::uuid,
    'coach.college@test.com',
    'coach'::public.user_role,
    'Dr. Elena Martinez',
    'Dr. Elena',
    'Martinez',
    'California State University SB',
    NULL,
    'college',
    'San Bernardino',
    NULL,
    true,
    true,
    true
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

-- Mirror handle_new_user trigger side-effects for seeded accounts (ensure auth identities exist)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'admin@test.com'),
    'email',
    '00000000-0000-0000-0000-000000000001',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000002'::uuid,
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'coach.active@test.com'),
    'email',
    '00000000-0000-0000-0000-000000000002',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000003'::uuid,
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003', 'email', 'coach.pending@test.com'),
    'email',
    '00000000-0000-0000-0000-000000000003',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000004'::uuid,
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'email', 'coach.college@test.com'),
    'email',
    '00000000-0000-0000-0000-000000000004',
    now(),
    now(),
    now()
  )
ON CONFLICT (provider, provider_id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  provider_id = EXCLUDED.provider_id,
  updated_at = now();

-- Profiles are auto-created by trigger, but update them with full data
UPDATE public.profiles SET
  full_name = 'Admin User',
  first_name = 'Admin',
  last_name = 'User',
  school_name = 'IE Mayors Cup HQ',
  is_approved = true,
  role = 'admin'::public.user_role
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- =============================================================================
-- COMPETITORS - Various Edge Cases
-- =============================================================================

-- HIGH SCHOOL STUDENTS (Sarah Johnson's team)
-- Student 1: 18+, everything complete, on team
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  media_release_date, participation_agreement_date,
  gender, race, ethnicity, level_of_technology, years_competing,
  game_platform_id, syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'alex.rivera@personal.com',
  'alex.rivera@valleyhigh.edu',
  'Alex', 'Rivera',
  true, '12', 'high_school', 'complete', true,
  now() - interval '10 days',
  now() - interval '10 days',
  'Male', 'Hispanic', 'Hispanic or Latino', 'High', 2,
  'syned_user_001', 'school_valley_hs', 'region_riverside', 'traditional'
);

-- Student 2: 17, parent consent needed, waiting for agreement
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  parent_name, parent_email,
  gender, race, ethnicity, level_of_technology, years_competing,
  game_platform_id, syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'emma.wong@personal.com',
  'emma.wong@valleyhigh.edu',
  'Emma', 'Wong',
  false, '11', 'high_school', 'compliance', true,
  'Linda Wong', 'linda.wong@email.com',
  'Female', 'Asian', 'Asian', 'High', 1,
  'syned_user_002', 'school_valley_hs', 'region_riverside', 'traditional'
);

-- Student 3: Just profile complete, no agreements yet
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  parent_name, parent_email,
  gender, race, ethnicity, level_of_technology, years_competing,
  syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'jordan.lee@personal.com',
  'jordan.lee@valleyhigh.edu',
  'Jordan', 'Lee',
  false, '10', 'high_school', 'profile', true,
  'Michael Lee', 'michael.lee@email.com',
  'Non-binary', 'White', 'Not Hispanic or Latino', 'Medium', 0,
  'school_valley_hs', 'region_riverside', 'traditional'
);

-- Student 4: Game platform sync error
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  media_release_date, participation_agreement_date,
  gender, race, ethnicity, level_of_technology, years_competing,
  game_platform_id, game_platform_sync_error,
  syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000004'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'sam.patel@personal.com',
  'sam.patel@valleyhigh.edu',
  'Sam', 'Patel',
  true, '11', 'high_school', 'complete', true,
  now() - interval '5 days',
  now() - interval '5 days',
  'Male', 'Asian', 'Asian', 'High', 1,
  'syned_user_004', 'API timeout after 3 attempts',
  'school_valley_hs', 'region_riverside', 'traditional'
);

-- MIDDLE SCHOOL STUDENTS (Mike Chen's students - pending approval)
-- Student 5: 13 year old, needs parent consent
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  parent_name, parent_email,
  gender, race, ethnicity, level_of_technology, years_competing,
  syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000005'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid,
  null,
  'maya.rodriguez@desertview.edu',
  'Maya', 'Rodriguez',
  false, '8', 'middle_school', 'profile', true,
  'Carlos Rodriguez', 'carlos.rodriguez@email.com',
  'Female', 'Hispanic', 'Hispanic or Latino', 'Medium', 0,
  'school_desert_view_ms', 'region_san_bernardino', 'traditional'
);

-- COLLEGE STUDENTS (Dr. Martinez's students)
-- Student 6: Traditional college track, 19 years old
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  media_release_date, participation_agreement_date,
  gender, race, ethnicity, level_of_technology, years_competing,
  game_platform_id, syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000006'::uuid,
  '00000000-0000-0000-0000-000000000004'::uuid,
  'jessica.kim@personal.com',
  'jessica.kim@csusb.edu',
  'Jessica', 'Kim',
  true, 'Sophomore', 'college', 'complete', true,
  now() - interval '15 days',
  now() - interval '15 days',
  'Female', 'Asian', 'Asian', 'High', 2,
  'syned_user_006', 'school_csusb', 'region_san_bernardino', 'traditional'
);

-- Student 7: Adult education track (continuing ed student)
INSERT INTO public.competitors (
  id, coach_id, email_personal, email_school, first_name, last_name,
  is_18_or_over, grade, division, status, is_active,
  media_release_date, participation_agreement_date,
  gender, race, ethnicity, level_of_technology, years_competing,
  game_platform_id, syned_school_id, syned_region_id, program_track
) VALUES (
  '10000000-0000-0000-0000-000000000007'::uuid,
  '00000000-0000-0000-0000-000000000004'::uuid,
  'robert.taylor@personal.com',
  'robert.taylor@csusb.edu',
  'Robert', 'Taylor',
  true, 'Continuing Ed', 'college', 'complete', true,
  now() - interval '20 days',
  now() - interval '20 days',
  'Male', 'Black or African American', 'Not Hispanic or Latino', 'Medium', 0,
  'syned_user_007', 'school_csusb', 'region_san_bernardino', 'adult_ed'
);

-- =============================================================================
-- PARENTAL AGREEMENTS - Various States
-- =============================================================================

-- Agreement 1: Completed via Zoho (adult student)
INSERT INTO public.agreements (
  id, competitor_id, provider, request_id, status, template_kind,
  zoho_completed, completion_source,
  signers, signed_pdf_path,
  created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000001'::uuid,
  '10000000-0000-0000-0000-000000000001'::uuid,
  'zoho', 'ZOHO_REQ_001', 'completed', 'adult',
  true, 'zoho',
  '[{"name": "Alex Rivera", "email": "alex.rivera@personal.com", "signed_at": "2025-10-14T10:30:00Z"}]'::jsonb,
  'agreements/alex_rivera_signed.pdf',
  now() - interval '10 days',
  now() - interval '10 days'
);

-- Agreement 2: Pending (sent to parent, not signed yet)
INSERT INTO public.agreements (
  id, competitor_id, provider, request_id, status, template_kind,
  zoho_completed, completion_source,
  signers,
  created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000002'::uuid,
  '10000000-0000-0000-0000-000000000002'::uuid,
  'zoho', 'ZOHO_REQ_002', 'sent', 'minor',
  false, 'zoho',
  '[{"name": "Linda Wong", "email": "linda.wong@email.com"}]'::jsonb,
  now() - interval '3 days',
  now() - interval '3 days'
);

-- Agreement 3: Manually completed (uploaded by coach)
INSERT INTO public.agreements (
  id, competitor_id, provider, request_id, status, template_kind,
  zoho_completed, completion_source, manual_completion_reason,
  manual_uploaded_path, manual_completed_at,
  signers,
  created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000003'::uuid,
  '10000000-0000-0000-0000-000000000004'::uuid,
  'zoho', 'MANUAL_001', 'completed', 'adult',
  false, 'manual', 'Parent requested paper form, scanned and uploaded',
  'agreements/sam_patel_manual.pdf', now() - interval '5 days',
  '[{"name": "Sam Patel", "email": "sam.patel@personal.com"}]'::jsonb,
  now() - interval '5 days',
  now() - interval '5 days'
);

-- =============================================================================
-- TEAMS
-- =============================================================================

-- Team 1: Active high school team with members
INSERT INTO public.teams (
  id, coach_id, name, description, division, status,
  affiliation, game_platform_id, coach_game_platform_id, syned_coach_user_id,
  game_platform_synced_at
) VALUES (
  '30000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Valley Cyber Hawks', 
  'Elite cybersecurity competition team from Valley High School',
  'high_school', 'active',
  'Valley High School',
  'syned_team_001', 'syned_coach_002', 'syned_coach_002',
  now() - interval '8 days'
);

-- Team 2: Forming team (not yet active)
INSERT INTO public.teams (
  id, coach_id, name, description, division, status,
  affiliation
) VALUES (
  '30000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Valley Junior Team',
  'New team for students interested in web security',
  'high_school', 'forming',
  'Valley High School'
);

-- Team 3: College team
INSERT INTO public.teams (
  id, coach_id, name, description, division, status,
  affiliation, game_platform_id, coach_game_platform_id, syned_coach_user_id,
  game_platform_synced_at
) VALUES (
  '30000000-0000-0000-0000-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000004'::uuid,
  'CSUSB Coyote Hackers',
  'University cybersecurity competition team',
  'college', 'active',
  'California State University San Bernardino',
  'syned_team_003', 'syned_coach_004', 'syned_coach_004',
  now() - interval '12 days'
);

-- =============================================================================
-- TEAM MEMBERS
-- =============================================================================

-- Add students to teams
INSERT INTO public.team_members (team_id, competitor_id, position, game_platform_synced_at) VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 1, now() - interval '8 days'),
  ('30000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, 2, now() - interval '8 days');

INSERT INTO public.team_members (team_id, competitor_id, position, game_platform_synced_at) VALUES
  ('30000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000006'::uuid, 1, now() - interval '12 days'),
  ('30000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000007'::uuid, 2, now() - interval '12 days');

-- =============================================================================
-- GAME PLATFORM PROFILES
-- =============================================================================

-- Profiles for synced competitors
INSERT INTO public.game_platform_profiles (
  id, competitor_id, metactf_role, synced_user_id, metactf_user_id, 
  metactf_username, status, last_synced_at
) VALUES 
  ('40000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 
   'user'::public.metactf_role, 'syned_user_001', 1001, 'alex_rivera', 'user_created'::public.metactf_sync_status, now() - interval '8 days'),
  
  ('40000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 
   'user'::public.metactf_role, 'syned_user_002', 1002, 'emma_wong', 'approved'::public.metactf_sync_status, now() - interval '7 days'),
   
  ('40000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, 
   'user'::public.metactf_role, 'syned_user_004', 1004, 'sam_patel', 'error'::public.metactf_sync_status, now() - interval '5 days');

-- Coach profiles
INSERT INTO public.game_platform_profiles (
  id, coach_id, metactf_role, synced_user_id, metactf_user_id, 
  metactf_username, status, last_synced_at
) VALUES 
  ('40000000-0000-0000-0000-000000000100'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'coach'::public.metactf_role, 'syned_coach_002', 2001, 'sarah_johnson_coach', 'approved'::public.metactf_sync_status, now() - interval '15 days'),
   
  ('40000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000004'::uuid,
   'coach'::public.metactf_role, 'syned_coach_004', 2002, 'elena_martinez_coach', 'approved'::public.metactf_sync_status, now() - interval '15 days');

-- =============================================================================
-- GAME PLATFORM SYNC STATE
-- =============================================================================

INSERT INTO public.game_platform_sync_state (
  synced_user_id, last_odl_synced_at, last_flash_ctf_synced_at,
  last_remote_accessed_at, last_attempt_at, last_result, needs_totals_refresh
) VALUES
  ('syned_user_001', now() - interval '1 day', now() - interval '1 day',
   now() - interval '2 hours', now() - interval '1 day', 'success', false),
   
  ('syned_user_002', now() - interval '2 days', now() - interval '2 days',
   now() - interval '3 hours', now() - interval '2 days', 'success', true),
   
  ('syned_user_004', now() - interval '5 days', null,
   null, now() - interval '1 hour', 'failure', true);

-- =============================================================================
-- GAME PLATFORM STATS
-- =============================================================================

INSERT INTO public.game_platform_stats (
  id, competitor_id, challenges_completed, monthly_ctf_challenges,
  total_score, last_activity, synced_at
) VALUES
  ('50000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid,
   45, 12, 2350, now() - interval '2 hours', now() - interval '1 day'),
   
  ('50000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid,
   23, 8, 1150, now() - interval '1 day', now() - interval '2 days'),
   
  ('50000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000006'::uuid,
   67, 15, 3420, now() - interval '5 hours', now() - interval '1 day');

-- =============================================================================
-- GAME PLATFORM CHALLENGE SOLVES
-- =============================================================================

-- Recent challenge solves for Alex Rivera
INSERT INTO public.game_platform_challenge_solves (
  synced_user_id, metactf_user_id, challenge_solve_id, challenge_id,
  challenge_title, challenge_category, challenge_points, solved_at, source
) VALUES
  ('syned_user_001', 1001, 5001, 101, 'SQL Injection 101', 'Web Security', 50, 
   now() - interval '3 hours', 'odl'),
  ('syned_user_001', 1001, 5002, 102, 'Cross-Site Scripting', 'Web Security', 75, 
   now() - interval '1 day', 'odl'),
  ('syned_user_001', 1001, 5003, 103, 'Buffer Overflow Basics', 'Binary Exploitation', 100, 
   now() - interval '2 days', 'odl');

-- Emma Wong's solves
INSERT INTO public.game_platform_challenge_solves (
  synced_user_id, metactf_user_id, challenge_solve_id, challenge_id,
  challenge_title, challenge_category, challenge_points, solved_at, source
) VALUES
  ('syned_user_002', 1002, 5004, 104, 'Password Cracking', 'Cryptography', 60, 
   now() - interval '1 day', 'odl'),
  ('syned_user_002', 1002, 5005, 105, 'Network Scanning', 'Network Security', 40, 
   now() - interval '3 days', 'odl');

-- =============================================================================
-- GAME PLATFORM FLASH CTF EVENTS
-- =============================================================================

INSERT INTO public.game_platform_flash_ctf_events (
  synced_user_id, metactf_user_id, event_id, flash_ctf_name,
  challenges_solved, points_earned, rank, started_at, ended_at
) VALUES
  ('syned_user_001', 1001, 'FLASH_001', 'Weekend Warriors CTF',
   8, 450, 15, now() - interval '7 days', now() - interval '5 days'),
   
  ('syned_user_002', 1002, 'FLASH_001', 'Weekend Warriors CTF',
   5, 280, 32, now() - interval '7 days', now() - interval '5 days');

-- =============================================================================
-- CONVERSATIONS
-- =============================================================================

-- Announcement conversation
INSERT INTO public.conversations (id, type, title, created_by, created_at) VALUES
  ('60000000-0000-0000-0000-000000000001'::uuid, 'announcement', 
   'Welcome to IE Mayors Cup 2025!', '00000000-0000-0000-0000-000000000001'::uuid,
   now() - interval '15 days');

-- DM between admin and coach
INSERT INTO public.conversations (id, type, title, created_by, created_at) VALUES
  ('60000000-0000-0000-0000-000000000002'::uuid, 'dm',
   null, '00000000-0000-0000-0000-000000000001'::uuid,
   now() - interval '5 days');

-- Group conversation for Sarah's team
INSERT INTO public.conversations (id, type, title, created_by, created_at) VALUES
  ('60000000-0000-0000-0000-000000000003'::uuid, 'group',
   'Valley Cyber Hawks Team Chat', '00000000-0000-0000-0000-000000000002'::uuid,
   now() - interval '10 days');

-- =============================================================================
-- CONVERSATION MEMBERS
-- =============================================================================

-- Announcement - all coaches and admin
INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES
  ('60000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('60000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'member'),
  ('60000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, 'member'),
  ('60000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000004'::uuid, 'member');

-- DM members
INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES
  ('60000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'member'),
  ('60000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'member');

-- Group chat members
INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES
  ('60000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'admin');

-- =============================================================================
-- MESSAGES
-- =============================================================================

-- Announcement message
INSERT INTO public.messages (id, conversation_id, sender_id, body, created_at) VALUES
  ('70000000-0000-0000-0000-000000000001'::uuid,
   '60000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Welcome to the 2025 IE Mayors Cup Cybersecurity Challenge! We''re excited to have you all participating this year. Important dates: Registration closes October 31, Competition begins November 15. Good luck to all teams!',
   now() - interval '15 days');

-- DM messages
INSERT INTO public.messages (id, conversation_id, sender_id, body, created_at) VALUES
  ('70000000-0000-0000-0000-000000000002'::uuid,
   '60000000-0000-0000-0000-000000000002'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Hi Sarah, I noticed you have some students pending parental consent. Let me know if you need any help with the process.',
   now() - interval '5 days'),
  
  ('70000000-0000-0000-0000-000000000003'::uuid,
   '60000000-0000-0000-0000-000000000002'::uuid,
   '00000000-0000-0000-0000-000000000002'::uuid,
   'Thanks! I sent out the Zoho Sign requests but one parent is having trouble with the electronic signature. Can I upload a scanned paper form instead?',
   now() - interval '4 days'),
   
  ('70000000-0000-0000-0000-000000000004'::uuid,
   '60000000-0000-0000-0000-000000000002'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Absolutely! Just use the manual upload option on the competitor''s profile page and add a note about why it was done manually.',
   now() - interval '4 days');

-- Group chat messages
INSERT INTO public.messages (id, conversation_id, sender_id, body, created_at) VALUES
  ('70000000-0000-0000-0000-000000000005'::uuid,
   '60000000-0000-0000-0000-000000000003'::uuid,
   '00000000-0000-0000-0000-000000000002'::uuid,
   'Team meeting today at 3pm in the computer lab. We''ll be going over SQL injection techniques!',
   now() - interval '2 days');

-- =============================================================================
-- JOB QUEUE - Sample background jobs
-- =============================================================================

-- Pending sync job
INSERT INTO public.job_queue (task_type, payload, status, run_at, max_attempts) VALUES
  ('game_platform_sync', '{"dryRun": false}'::jsonb, 'pending', now() + interval '1 hour', 3);

-- Completed sync job (historical)
INSERT INTO public.job_queue (
  task_type, payload, status, run_at, max_attempts, attempts, 
  completed_at, output
) VALUES
  ('game_platform_sync', '{"dryRun": false}'::jsonb, 'succeeded', 
   now() - interval '1 day', 3, 1, now() - interval '23 hours',
   '{"competitors_synced": 5, "challenges_fetched": 15}'::jsonb);

-- Failed job example
INSERT INTO public.job_queue (
  task_type, payload, status, run_at, max_attempts, attempts,
  last_error, completed_at
) VALUES
  ('game_platform_sync', '{"competitor_id": "10000000-0000-0000-0000-000000000004"}'::jsonb,
   'failed', now() - interval '5 hours', 3, 3,
   'API timeout: Could not reach game platform after 3 retry attempts',
   now() - interval '5 hours');

-- =============================================================================
-- SYSTEM CONFIG
-- =============================================================================

INSERT INTO public.system_config (key, value, description, updated_by) VALUES
  ('game_platform_sync_enabled', 'true'::jsonb, 
   'Enable/disable automatic game platform sync', 
   '00000000-0000-0000-0000-000000000001'::uuid),
   
  ('sync_interval_minutes', '60'::jsonb,
   'How often to run game platform sync jobs (in minutes)',
   '00000000-0000-0000-0000-000000000001'::uuid);

-- =============================================================================
-- NICE FRAMEWORK REFERENCE DATA
-- =============================================================================

INSERT INTO public.nice_framework_work_roles (work_role_id, title, description, category) VALUES
  ('DD-WRL-003', 'Web Application Penetration Tester', 'Tests web applications for security vulnerabilities', 'DD'),
  ('PD-WRL-001', 'Cybersecurity Analyst', 'Analyzes and responds to security threats', 'PD'),
  ('IN-WRL-002', 'Cyber Crime Investigator', 'Investigates cyber crimes and security incidents', 'IN'),
  ('OG-WRL-001', 'Cybersecurity Manager', 'Manages cybersecurity programs and teams', 'OG');

-- =============================================================================
-- SUMMARY
-- =============================================================================

-- Verify seed data
DO $$
DECLARE
  coach_count INT;
  competitor_count INT;
  team_count INT;
  agreement_count INT;
BEGIN
  SELECT COUNT(*) INTO coach_count FROM public.profiles WHERE role = 'coach'::public.user_role;
  SELECT COUNT(*) INTO competitor_count FROM public.competitors;
  SELECT COUNT(*) INTO team_count FROM public.teams;
  SELECT COUNT(*) INTO agreement_count FROM public.agreements;
  
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'SEED DATA SUMMARY';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Coaches: %', coach_count;
  RAISE NOTICE 'Competitors: %', competitor_count;
  RAISE NOTICE 'Teams: %', team_count;
  RAISE NOTICE 'Agreements: %', agreement_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Test Login Credentials (all users):';
  RAISE NOTICE '  Email: admin@test.com (or other seeded emails)';
  RAISE NOTICE '  Password: TestPassword123!';
  RAISE NOTICE '';
  RAISE NOTICE 'Key Test Scenarios:';
  RAISE NOTICE '  - Adult (18+) student with complete profile';
  RAISE NOTICE '  - Minor student waiting for parent consent';
  RAISE NOTICE '  - Student with only profile (no agreements)';
  RAISE NOTICE '  - Student with game platform sync error';
  RAISE NOTICE '  - Manual agreement upload example';
  RAISE NOTICE '  - College students (traditional vs adult ed)';
  RAISE NOTICE '  - Teams (active, forming, with members)';
  RAISE NOTICE '  - Challenge solves and stats data';
  RAISE NOTICE '  - Conversations (announcement, DM, group)';
  RAISE NOTICE '=================================================================';
END $$;
