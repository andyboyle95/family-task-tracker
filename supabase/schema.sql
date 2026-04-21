-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── FAMILIES ────────────────────────────────────────────────────────────────
create table public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text unique not null,
  created_at   timestamptz default now()
);

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- No auth.users dependency — profiles are created directly when joining a family
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families(id) on delete cascade,
  name          text not null,
  avatar_color  text not null default '#4f46e5',
  role          text not null default 'member' check (role in ('admin','member')),
  points        integer not null default 0,
  created_at    timestamptz default now()
);

-- ─── TASKS ───────────────────────────────────────────────────────────────────
create table public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families(id) on delete cascade,
  title                 text not null,
  notes                 text,
  assigned_to           uuid references public.profiles(id) on delete set null,
  created_by            uuid not null references public.profiles(id),
  due_at                timestamptz,
  status                text not null default 'pending' check (status in ('pending','completed','cancelled')),
  point_bounty          integer not null default 10 check (point_bounty >= 1),
  recurrence_rule       text,
  recurrence_parent_id  uuid references public.tasks(id) on delete set null,
  completed_at          timestamptz,
  completed_by          uuid references public.profiles(id) on delete set null,
  created_at            timestamptz default now()
);

-- ─── PUSH SUBSCRIPTIONS ──────────────────────────────────────────────────────
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  subscription  jsonb not null,
  created_at    timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- All writes go through the service role key (bypasses RLS).
-- We enable permissive read so the Supabase Realtime client (anon key) works.
alter table public.families           enable row level security;
alter table public.profiles           enable row level security;
alter table public.tasks              enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "public read" on public.families           for select using (true);
create policy "public read" on public.profiles           for select using (true);
create policy "public read" on public.tasks              for select using (true);
create policy "public read" on public.push_subscriptions for select using (true);

-- ─── REALTIME ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.profiles;
