-- Caretaker check-in app schema.
-- Run this once in the Supabase SQL editor for your project.

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
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

-- Only the weekly email script (using the service role key, which bypasses
-- RLS) needs to read rows, so no anon select policy is created.
