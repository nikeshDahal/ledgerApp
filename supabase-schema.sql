-- Trikut Snacks Ledger — Supabase schema (fresh install)
-- Run this once in a NEW Supabase project's SQL Editor.
-- If you already have this app running and are upgrading to the three-tier
-- role system, use supabase-migration-team-roles.sql instead — this file
-- assumes neither table exists yet.

-- 1. Company-wide key/value store.
-- All ledger data (transactions, customers, stock, sales, etc.) is stored
-- here as JSON blobs, one row per data type. Every logged-in user shares
-- the same rows — this is a single-business app, not a multi-tenant one.
create table if not exists kv_store (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table kv_store enable row level security;

create policy "Authenticated users can read kv_store"
  on kv_store for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can write kv_store"
  on kv_store for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update kv_store"
  on kv_store for update
  using (auth.role() = 'authenticated');

-- 2. User profiles: name, email, and role (super_admin, admin, or staff).
-- New sign-ups default to 'staff'. Roles are managed from the in-app Team
-- tab (visible to Super Admins only), which is backed by the update policy
-- below — no manual SQL needed for day-to-day role changes.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'staff' check (role in ('super_admin', 'admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Authenticated users can read all profiles"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Only Super Admins can update profiles (including their own name, and
-- anyone's role). Regular admins and staff have no update policy at all, so
-- they can't self-promote even by tampering with client requests directly —
-- this is enforced by the database, not just the UI.
create policy "Super admins can update any profile"
  on profiles for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

-- The very first account on a fresh project has no Super Admin to promote
-- it, so run this once by hand after your first sign-up (find the UUID
-- under Authentication -> Users in the Supabase dashboard):
--   update profiles set role = 'super_admin' where id = 'the-users-uuid';
