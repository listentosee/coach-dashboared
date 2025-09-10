-- Add competitor division enum and column; index for filtering
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'competitor_division') then
    create type public.competitor_division as enum ('middle_school','high_school','college');
  end if;
end $$;

alter table public.competitors
  add column if not exists division public.competitor_division;

-- Helpful index for coach/division filtering
create index if not exists idx_competitors_division_active
  on public.competitors (coach_id, division, is_active);

commit;

