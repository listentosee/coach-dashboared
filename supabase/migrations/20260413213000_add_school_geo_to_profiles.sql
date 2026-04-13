alter table public.profiles
  add column if not exists school_geo jsonb;

comment on column public.profiles.school_geo is 'Stored school geolocation payload for analytics map, e.g. {"lat": 34.1083, "lon": -117.2898}.';

