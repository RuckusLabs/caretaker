-- Caretaker check-in app schema.
-- Safe to re-run: uses "if not exists" everywhere, so running this again
-- against a project that already has real check-in history will NOT drop
-- or lose any of it. (An earlier version of this file dropped the table
-- unconditionally — that's no longer the case.)

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  rate numeric,
  shift text not null check (shift in ('morning', 'afternoon')),
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz,
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table checkins enable row level security;

-- Open-entry app: anyone with the public anon key can create a check-in row
-- and later close out (sign out of) their own row by id. There is no login,
-- so this does not stop someone from editing another row if they know its
-- id. That's an accepted tradeoff for an internal, low-stakes tool with no
-- sensitive data beyond a name and phone number.
--
-- Postgres has no "create policy if not exists", so each policy is dropped
-- first to keep this file safely re-runnable.
drop policy if exists "anon can insert checkins" on checkins;
create policy "anon can insert checkins"
  on checkins for insert
  to anon
  with check (true);

drop policy if exists "anon can update checkins" on checkins;
create policy "anon can update checkins"
  on checkins for update
  to anon
  using (true)
  with check (true);

-- The app calls .insert(...).select() and .update(...).select() to get the
-- row back after writing it. Postgres checks a SELECT policy against rows
-- returned by a RETURNING clause, so a select policy is required even
-- though the app never lists/browses other people's rows.
drop policy if exists "anon can select checkins" on checkins;
create policy "anon can select checkins"
  on checkins for select
  to anon
  using (true);

-- Caretaker roster, editable from the admin page. anon (the check-in app)
-- can only read it, to populate the name dropdown and pull each
-- caretaker's rate; only a logged-in (authenticated) admin user can add,
-- edit, or remove caretakers.
create table if not exists caretakers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  rate numeric not null,
  created_at timestamptz not null default now()
);

alter table caretakers enable row level security;

drop policy if exists "anon can read caretakers" on caretakers;
create policy "anon can read caretakers"
  on caretakers for select
  to anon
  using (true);

drop policy if exists "admin can manage caretakers" on caretakers;
create policy "admin can manage caretakers"
  on caretakers for all
  to authenticated
  using (true)
  with check (true);

-- No seed data here on purpose — this repo is public, and caretaker names
-- and phone numbers shouldn't be committed to it. Add your roster from the
-- admin page (admin.html) after running this file instead.
