-- Shorten competitor profile update token expiration to 7 days per FERPA requirements

-- Ensure the trigger always sets a fresh token and 7-day expiry
CREATE OR REPLACE FUNCTION public.set_profile_update_token_with_expiry()
RETURNS trigger AS $$
BEGIN
    NEW.profile_update_token := generate_profile_update_token();
    NEW.profile_update_token_expires := NOW() + INTERVAL '7 days';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clamp existing tokens so none exceed 7 days from now
UPDATE public.competitors
SET profile_update_token_expires = LEAST(profile_update_token_expires, NOW() + INTERVAL '7 days')
WHERE profile_update_token_expires IS NOT NULL
  AND profile_update_token_expires > NOW() + INTERVAL '7 days';
