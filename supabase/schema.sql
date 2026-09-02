-- Caretaker check-in app schema.
-- Run this in the Supabase SQL editor for your project. This drops any
-- existing checkins table first, so only run it when it's fine to lose
-- whatever check-in history is already there.

drop table if exists checkins cascade;

create table checkins (
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
create policy "anon can insert checkins"
  on checkins for insert
  to anon
  with check (true);

create policy "anon can update checkins"
  on checkins for update
  to anon
  using (true)
  with check (true);

-- The app calls .insert(...).select() and .update(...).select() to get the
-- row back after writing it. Postgres checks a SELECT policy against rows
-- returned by a RETURNING clause, so a select policy is required even
-- though the app never lists/browses other people's rows.
create policy "anon can select checkins"
  on checkins for select
  to anon
  using (true);
