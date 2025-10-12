-- Create NICE Framework work roles reference table
-- This table stores NIST NICE Framework work role metadata for translating
-- work role codes (e.g., "DD-WRL-003") into human-readable titles

CREATE TABLE IF NOT EXISTS public.nice_framework_work_roles (
  work_role_id text PRIMARY KEY,       -- e.g., 'DD-WRL-003'
  title text NOT NULL,                 -- e.g., 'Secure Software Development'
  description text,                    -- Full description from NIST
  category text NOT NULL,              -- e.g., 'DD', 'OG', 'PD', 'IO', 'IN'
  created_at timestamptz DEFAULT now()
);

-- Index for filtering by category
CREATE INDEX IF NOT EXISTS idx_nice_work_roles_category
  ON public.nice_framework_work_roles(category);

-- Enable RLS (read-only for all authenticated users)
ALTER TABLE public.nice_framework_work_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_nice_work_roles"
  ON public.nice_framework_work_roles FOR SELECT
  USING (true);

-- Comments for documentation
COMMENT ON TABLE public.nice_framework_work_roles IS 'Reference table for NIST NICE Framework work roles - used to translate codes into human-readable titles';
COMMENT ON COLUMN public.nice_framework_work_roles.work_role_id IS 'Unique NICE Framework work role identifier (e.g., DD-WRL-003)';
COMMENT ON COLUMN public.nice_framework_work_roles.title IS 'Human-readable work role title';
COMMENT ON COLUMN public.nice_framework_work_roles.description IS 'Full description from NIST NICE Framework';
COMMENT ON COLUMN public.nice_framework_work_roles.category IS 'Work role category: OG (Oversee & Govern), DD (Design & Development), IO (Operate & Maintain), PD (Protect & Defend), IN (Investigate)';
