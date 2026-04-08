-- ============================================================
-- FileVault Database Schema
-- Run this in your Supabase SQL Editor (supabase.com > SQL)
-- ============================================================

-- 1. Profiles table (extends Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz default now()
);

-- 2. Folders table
create table if not exists public.folders (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  parent_id uuid references public.folders on delete cascade,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz default now()
);

-- 3. Files table
create table if not exists public.files (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  storage_path text not null,
  size bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  folder_id uuid references public.folders on delete set null,
  uploaded_by uuid references public.profiles on delete set null,
  created_at timestamptz default now()
);

-- 4. Share links table
create table if not exists public.share_links (
  id uuid default gen_random_uuid() primary key,
  file_id uuid references public.files on delete cascade not null,
  token text unique not null,
  expires_at timestamptz,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_files_folder_id on public.files(folder_id);
create index if not exists idx_files_uploaded_by on public.files(uploaded_by);
create index if not exists idx_folders_parent_id on public.folders(parent_id);
create index if not exists idx_share_links_token on public.share_links(token);
create index if not exists idx_share_links_file_id on public.share_links(file_id);

-- ============================================================
-- Auto-create profile on signup (trigger)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    -- First user is admin, rest are viewers
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'viewer' end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.share_links enable row level security;

-- Profiles: users can read all profiles, update only their own
create policy "Anyone can view profiles"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Admins can update any profile (for role changes)
create policy "Admins can update any profile"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Folders: all authenticated users can read, admins can create/update/delete
create policy "Authenticated users can view folders"
  on public.folders for select
  to authenticated
  using (true);

create policy "Admins can create folders"
  on public.folders for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update folders"
  on public.folders for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete folders"
  on public.folders for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Files: all authenticated users can read, admins can create/delete
create policy "Authenticated users can view files"
  on public.files for select
  to authenticated
  using (true);

create policy "Admins can upload files"
  on public.files for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete files"
  on public.files for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Share links: authenticated users can read, admins can create/delete
-- Also allow anonymous read for public shared file downloads
create policy "Anyone can view share links by token"
  on public.share_links for select
  using (true);

create policy "Admins can create share links"
  on public.share_links for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete share links"
  on public.share_links for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Also allow anon to read files metadata (for shared links)
create policy "Anon can view files for share links"
  on public.files for select
  to anon
  using (
    exists (
      select 1 from public.share_links
      where file_id = files.id
        and (expires_at is null or expires_at > now())
    )
  );

-- ============================================================
-- Storage bucket policies (run separately in Storage settings)
-- Note: You also need to create the bucket 'vault-files' in the
-- Supabase dashboard under Storage, and set these policies there.
-- ============================================================
-- The storage policies below should be added via the Supabase
-- Storage UI. Here they are for reference:
--
-- INSERT (upload): authenticated users where profile role = 'admin'
-- SELECT (download): authenticated users OR valid share link exists
-- DELETE: authenticated users where profile role = 'admin'
