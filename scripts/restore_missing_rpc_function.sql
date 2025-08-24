-- Restore the missing generate_profile_update_token RPC function

-- Create the function that generates a secure token
CREATE OR REPLACE FUNCTION generate_profile_update_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION generate_profile_update_token() TO authenticated;
