-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── FAMILIES ────────────────────────────────────────────────────────────────
create table public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text unique not null,
  created_at   timestamptz default now()
);

-- ─── PROFILES (extends auth.users) ───────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  family_id     uuid references public.families(id) on delete set null,
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
alter table public.families           enable row level security;
alter table public.profiles           enable row level security;
alter table public.tasks              enable row level security;
alter table public.push_subscriptions enable row level security;

-- Families: members can read their own family
create policy "family members can read" on public.families
  for select using (
    id in (select family_id from public.profiles where id = auth.uid())
  );

-- Families: anyone authenticated can insert (create family)
create policy "authenticated can create family" on public.families
  for insert with check (auth.uid() is not null);

-- Families: admins can update their family
create policy "admins can update family" on public.families
  for update using (
    id in (
      select family_id from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Profiles: users can read profiles in their family
create policy "family members can read profiles" on public.profiles
  for select using (
    family_id in (select family_id from public.profiles where id = auth.uid())
    or id = auth.uid()
  );

-- Profiles: users can insert their own profile
create policy "users can insert own profile" on public.profiles
  for insert with check (id = auth.uid());

-- Profiles: users can update their own profile
create policy "users can update own profile" on public.profiles
  for update using (id = auth.uid());

-- Tasks: family members can read tasks
create policy "family members can read tasks" on public.tasks
  for select using (
    family_id in (select family_id from public.profiles where id = auth.uid())
  );

-- Tasks: family members can insert tasks
create policy "family members can insert tasks" on public.tasks
  for insert with check (
    family_id in (select family_id from public.profiles where id = auth.uid())
  );

-- Tasks: family members can update tasks
create policy "family members can update tasks" on public.tasks
  for update using (
    family_id in (select family_id from public.profiles where id = auth.uid())
  );

-- Tasks: admins and task creator can delete
create policy "admins and creators can delete tasks" on public.tasks
  for delete using (
    created_by = auth.uid()
    or family_id in (
      select family_id from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Push subscriptions: users manage their own
create policy "users manage own push subs" on public.push_subscriptions
  for all using (user_id = auth.uid());

-- ─── REALTIME ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.profiles;

-- ─── TRIGGER: auto-create profile on signup ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
