-- Add image_url column to teams table
ALTER TABLE teams ADD COLUMN image_url TEXT;

-- Add index for image_url lookups
CREATE INDEX idx_teams_image_url ON teams(image_url);

-- Add comment for documentation
COMMENT ON COLUMN teams.image_url IS 'URL to team image stored in Supabase Storage';
