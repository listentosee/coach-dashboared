begin;

-- Create storage bucket for coach resource library
insert into storage.buckets (id, name, public)
values ('coach-library', 'coach-library', false)
on conflict (id) do nothing;

create extension if not exists "pgcrypto";

-- Metadata table for library documents
create table if not exists public.coach_library_documents (
  id uuid primary key default gen_random_uuid(),
  file_path text not null unique,
  file_name text not null,
  content_type text,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_library_documents enable row level security;

create policy "coach_library_select" on public.coach_library_documents
  for select
  to authenticated
  using (true);

create policy "coach_library_insert_admin" on public.coach_library_documents
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "coach_library_update_admin" on public.coach_library_documents
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "coach_library_delete_admin" on public.coach_library_documents
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Storage access policies: authenticated users may read; only admins may write
create policy "coach_library_read" on storage.objects
  as permissive
  for select
  to authenticated
  using (bucket_id = 'coach-library');

create policy "coach_library_insert_admin" on storage.objects
  as permissive
  for insert
  to authenticated
  with check ((bucket_id = 'coach-library') and public.is_admin(auth.uid()));

create policy "coach_library_update_admin" on storage.objects
  as permissive
  for update
  to authenticated
  using ((bucket_id = 'coach-library') and public.is_admin(auth.uid()));

create policy "coach_library_delete_admin" on storage.objects
  as permissive
  for delete
  to authenticated
  using ((bucket_id = 'coach-library') and public.is_admin(auth.uid()));

commit;
