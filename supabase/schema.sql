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
  bowel_movement boolean not null default false,
  ate text check (ate in ('some', 'most', 'all')),
  notes text,
  created_at timestamptz not null default now()
);

-- If this table already existed before these end-of-shift fields were
-- added, run:
-- alter table checkins add column if not exists bowel_movement boolean not null default false;
-- alter table checkins add column if not exists ate text check (ate in ('some', 'most', 'all'));
-- alter table checkins add column if not exists notes text;

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

-- The admin page (admin.html) reads check-in history while logged in via
-- Supabase Auth, which makes its requests as "authenticated" rather than
-- "anon" — so it needs its own select policy here too.
drop policy if exists "authenticated can select checkins" on checkins;
create policy "authenticated can select checkins"
  on checkins for select
  to authenticated
  using (true);

-- Caretaker roster, editable from the admin page. anon (the check-in app)
-- can read it, to populate the name dropdown and pull each caretaker's
-- rate, and insert into it (when someone signs in via "Someone else",
-- adding themselves so they show up in the dropdown next time). Only a
-- logged-in (authenticated) admin user can edit or remove caretakers,
-- or fix up a self-added entry.
create table if not exists caretakers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  rate numeric not null,
  created_at timestamptz not null default now()
);

-- Lets the app upsert-on-conflict when a "Someone else" sign-in matches an
-- existing entry's phone, instead of creating a duplicate row each time.
create unique index if not exists caretakers_phone_key on caretakers (phone);

alter table caretakers enable row level security;

drop policy if exists "anon can read caretakers" on caretakers;
create policy "anon can read caretakers"
  on caretakers for select
  to anon
  using (true);

-- Lets the check-in app add a new caretaker itself after an unlisted
-- ("Someone else") sign-in. Same open-entry tradeoff as checkins: no
-- login means anyone could add junk rows, but this is a low-stakes
-- internal tool and the admin page can delete anything unwanted.
drop policy if exists "anon can add caretakers" on caretakers;
create policy "anon can add caretakers"
  on caretakers for insert
  to anon
  with check (true);

drop policy if exists "admin can manage caretakers" on caretakers;
create policy "admin can manage caretakers"
  on caretakers for all
  to authenticated
  using (true)
  with check (true);

-- No seed data here on purpose — this repo is public, and caretaker names
-- and phone numbers shouldn't be committed to it. Add your roster from the
-- admin page (admin.html) after running this file instead.
