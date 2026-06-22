-- ── user_custom_cards ────────────────────────────────────────────────────────
create table user_custom_cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  text            text not null,
  pinyin          text not null,
  meaning         text not null,
  radical         text,
  radical_pinyin  text,
  radical_meaning text,
  mnemonic        text not null,
  example         text not null,
  example_pinyin  text not null,
  example_english text not null,
  is_phrase       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, text)
);

alter table user_custom_cards enable row level security;

create policy "custom_cards_select_own" on user_custom_cards
  for select to authenticated using (user_id = auth.uid());
create policy "custom_cards_insert_own" on user_custom_cards
  for insert to authenticated with check (user_id = auth.uid());
create policy "custom_cards_update_own" on user_custom_cards
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "custom_cards_delete_own" on user_custom_cards
  for delete to authenticated using (user_id = auth.uid());

-- ── Modify user_cards ────────────────────────────────────────────────────────
alter table user_cards
  drop constraint user_cards_user_id_character_id_key;

alter table user_cards
  alter column character_id drop not null,
  add column custom_card_id uuid references user_custom_cards(id) on delete cascade,
  add constraint user_cards_exactly_one_source
    check (num_nonnulls(character_id, custom_card_id) = 1);

create unique index user_cards_unique_character
  on user_cards (user_id, character_id)
  where character_id is not null;

create unique index user_cards_unique_custom
  on user_cards (user_id, custom_card_id)
  where custom_card_id is not null;

-- ── Modify review_log ────────────────────────────────────────────────────────
alter table review_log
  alter column character_id drop not null,
  add column custom_card_id uuid references user_custom_cards(id) on delete cascade,
  add constraint review_log_exactly_one_source
    check (num_nonnulls(character_id, custom_card_id) = 1);
