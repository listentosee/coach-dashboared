-- Team Image Candidates: staging table for AI-generated team images awaiting admin review.
-- Admin workflow: bulk-generate creates one candidate per team; admin reviews each and
-- accepts (copies to team image + updates teams.image_url), regenerates (new candidate),
-- or rejects (deletes candidate file).

CREATE TABLE IF NOT EXISTS public.team_image_candidates (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    candidate_path text,              -- path in team-images bucket; null if generation failed
    prompt_used text,                 -- final prompt sent to Gemini
    regen_instructions text,          -- freeform admin instructions when regenerating (null on first gen)
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','failed','superseded')),
    error_message text,               -- populated when status = 'failed'
    generated_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_team_image_candidates_team_id ON public.team_image_candidates(team_id);
CREATE INDEX IF NOT EXISTS idx_team_image_candidates_status ON public.team_image_candidates(status);
CREATE INDEX IF NOT EXISTS idx_team_image_candidates_generated_at ON public.team_image_candidates(generated_at DESC);

ALTER TABLE public.team_image_candidates ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
DROP POLICY IF EXISTS admins_can_manage_team_image_candidates ON public.team_image_candidates;
CREATE POLICY admins_can_manage_team_image_candidates ON public.team_image_candidates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

COMMENT ON TABLE public.team_image_candidates IS 'Staging area for AI-generated team images awaiting admin review.';
