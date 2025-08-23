-- Fix profile update token generation trigger
-- This ensures the database trigger is properly deployed

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS set_profile_update_token ON competitors;
DROP FUNCTION IF EXISTS generate_profile_update_token();

-- Create centralized token generation function
CREATE OR REPLACE FUNCTION generate_profile_update_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ language 'plpgsql';

-- Create function to set token with expiration
CREATE OR REPLACE FUNCTION set_profile_update_token_with_expiry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.profile_update_token = generate_profile_update_token();
    NEW.profile_update_token_expires = NOW() + INTERVAL '30 days';
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger for new competitors
CREATE TRIGGER set_profile_update_token BEFORE INSERT ON competitors
    FOR EACH ROW EXECUTE FUNCTION set_profile_update_token_with_expiry();

-- Update existing competitors that don't have tokens
UPDATE competitors 
SET 
    profile_update_token = generate_profile_update_token(),
    profile_update_token_expires = NOW() + INTERVAL '30 days'
WHERE profile_update_token IS NULL;
