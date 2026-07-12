-- Trikut Snacks Ledger — Supabase schema
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)

-- 1. Company-wide key/value store.
-- All ledger data (transactions, customers, stock, sales, etc.) is stored
-- here as JSON blobs, one row per data type. Every logged-in user (partner
-- or staff) shares the same rows — this is a single-business app, not a
-- multi-tenant one.
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

create policy "Authenticated users can delete kv_store"
  on kv_store for delete
  using (auth.role() = 'authenticated');

-- 2. User profiles: name + role (partner or staff).
-- New sign-ups default to 'staff'. To make someone a partner (so they can
-- see the Partner Capital tab), run:
--   update profiles set role = 'partner' where id = 'the-users-uuid';
-- (Find the UUID under Authentication -> Users in the Supabase dashboard.)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'staff' check (role in ('partner', 'staff')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Authenticated users can read all profiles"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Note: intentionally no update policy for role changes from the client.
-- Role upgrades (staff -> partner) must be done manually via the SQL
-- editor or Supabase dashboard, so staff accounts can't self-promote.
