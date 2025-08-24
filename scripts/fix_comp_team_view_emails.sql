-- Fix comp_team_view to include missing email fields
DROP VIEW IF EXISTS comp_team_view;

CREATE VIEW comp_team_view AS
SELECT 
    c.id,
    c.first_name,
    c.last_name,
    c.email_personal,
    c.email_school,
    c.is_18_or_over,
    c.grade,
    c.status,
    c.media_release_signed,
    c.media_release_date,
    c.participation_agreement_signed,
    c.participation_agreement_date,
    c.game_platform_id,
    c.game_platform_synced_at,
    c.profile_update_token,
    c.profile_update_token_expires,
    c.created_at,
    c.is_active,
    t.id AS team_id,
    t.name AS team_name,
    tm.position AS team_position
FROM competitors c
LEFT JOIN team_members tm ON c.id = tm.competitor_id
LEFT JOIN teams t ON tm.team_id = t.id
WHERE c.coach_id = auth.uid();
