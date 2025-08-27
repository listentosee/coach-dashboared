-- Fix the handle_new_user trigger to properly use Monday.com data from auth metadata
-- This ensures school_name, division, region, and other Monday.com fields are properly synced

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Grant permissions
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Verify the trigger is properly attached
-- (This should already exist, but we're ensuring it's updated)
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates profile records with Monday.com data when new users sign up';
