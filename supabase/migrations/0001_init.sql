-- Static reference data, same for all users
create table characters (
  id smallint primary key,
  char text not null unique,
  pinyin text not null,
  meaning text not null,
  radical text not null,
  radical_pinyin text not null,
  radical_meaning text not null,
  mnemonic text not null,
  mnemonic_type text not null check (mnemonic_type in ('C', 'H'))
);

-- Per-user FSRS state for each character they've started learning.
create table user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id smallint not null references characters(id),

  -- FSRS state (mirrors ts-fsrs Card fields)
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0,
  due timestamptz not null default now(),
  last_review timestamptz,

  created_at timestamptz not null default now(),
  unique (user_id, character_id)
);

-- Full review history
create table review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id smallint not null references characters(id),
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  state_before jsonb,
  state_after jsonb
);

-- One row per user
create table user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_new_card_limit smallint not null default 8,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table characters enable row level security;
alter table user_cards enable row level security;
alter table review_log enable row level security;
alter table user_progress enable row level security;

-- characters: authenticated users can read; no client writes
create policy "characters_select_authenticated"
  on characters for select
  to authenticated
  using (true);

-- user_cards
create policy "user_cards_select_own"
  on user_cards for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_cards_insert_own"
  on user_cards for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_cards_update_own"
  on user_cards for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_cards_delete_own"
  on user_cards for delete
  to authenticated
  using (user_id = auth.uid());

-- review_log
create policy "review_log_select_own"
  on review_log for select
  to authenticated
  using (user_id = auth.uid());

create policy "review_log_insert_own"
  on review_log for insert
  to authenticated
  with check (user_id = auth.uid());

-- user_progress
create policy "user_progress_select_own"
  on user_progress for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_progress_insert_own"
  on user_progress for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_progress_update_own"
  on user_progress for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_progress_delete_own"
  on user_progress for delete
  to authenticated
  using (user_id = auth.uid());
