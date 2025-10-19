-- Add program_track flag for college competitors
begin;

alter table public.competitors
  add column if not exists program_track text
    check (program_track in ('traditional', 'adult_ed'));

comment on column public.competitors.program_track is
  'Sub-classification for college competitors (traditional vs continuing/adult education)';

update public.competitors
set program_track = 'traditional'
where division = 'college'
  and (program_track is null or program_track = '');

commit;
