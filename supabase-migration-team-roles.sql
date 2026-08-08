-- Migration: three-tier roles (Super Admin / Admin / Staff) + Team tab
-- Run this ONCE in your existing project's SQL Editor. It's safe to run
-- even if some pieces already exist — each step only changes what's needed.
--
-- Do NOT run supabase-schema.sql over an existing database instead of this
-- file — "create table if not exists" won't update a table that already
-- exists, so your old check constraint and missing columns would stick
-- around. This migration handles that properly.

-- 1. Add the email column (used to show real emails in the Team tab).
alter table profiles add column if not exists email text not null default '';

-- 2. Backfill email for existing accounts from auth.users, where possible.
update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email = '';

-- 3. Drop the old two-value check constraint and add the new one.
-- (The constraint name below is what Postgres auto-generates for a table
-- named "profiles" with a check on "role" — if this errors because your
-- constraint has a different name, run:
--   select conname from pg_constraint where conrelid = 'profiles'::regclass;
-- to find the real name, then adjust the drop line accordingly.)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'staff'));

-- 4. Move existing 'partner' accounts to 'admin', so nobody loses access
-- they already had. You'll still want to promote at least one account to
-- 'super_admin' in step 6 below, since 'admin' alone can't manage the team.
update profiles set role = 'admin' where role = 'partner';

-- 5. Add the update policy so Super Admins can manage roles from the Team
-- tab instead of the SQL editor. Drop first in case this is re-run.
drop policy if exists "Super admins can update any profile" on profiles;
create policy "Super admins can update any profile"
  on profiles for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

-- 6. Promote yourself (or whoever should hold the top role) to Super Admin.
-- Find your UUID under Authentication -> Users in the Supabase dashboard,
-- or just match on email like this:
update profiles set role = 'super_admin' where email = 'your-email@example.com';
