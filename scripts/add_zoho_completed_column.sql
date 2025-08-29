-- Add zoho_completed column to agreements table
-- This column tracks whether manually completed agreements have been processed in Zoho

ALTER TABLE public.agreements 
ADD COLUMN IF NOT EXISTS zoho_completed BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.agreements.zoho_completed IS 'Indicates whether a manually completed agreement has been marked as complete in Zoho Sign';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS agreements_zoho_completed_idx ON public.agreements(zoho_completed) WHERE zoho_completed = FALSE;

-- Update existing completed agreements to have zoho_completed = FALSE
UPDATE public.agreements 
SET zoho_completed = FALSE 
WHERE status = 'completed' AND zoho_completed IS NULL;
