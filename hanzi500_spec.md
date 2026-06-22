# Hanzi500 — Build Spec for Claude Code

## 1. Project summary

A web app for learning the 500 most frequent Chinese characters (Jun Da frequency
list), combining:

1. **Learning Mode** — a guided first-exposure walkthrough of 5-10 new characters
   per day, each presented with character, pinyin, English meaning, radical
   breakdown, and a mnemonic.
2. **Review Mode** — an FSRS-driven spaced repetition flashcard system, recognition
   direction only (see hanzi → recall pinyin/meaning), 4-button grading
   (Again/Hard/Good/Easy).
3. A combined daily queue: due reviews surface first, then new cards top up to a
   daily new-card cap, in one session.

Single user type, proper Supabase Auth accounts (email/password + magic link),
deployed on Vercel.

---

## 2. Tech stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Row Level Security). No separate
  backend server — frontend talks to Supabase directly via `@supabase/supabase-js`,
  with RLS policies enforcing per-user data isolation.
- **Hosting**: Vercel (static frontend build)
- **Audio**: Web Speech API (`window.speechSynthesis`), `zh-CN` voice, no backend
  involvement, no API keys
- **SRS algorithm**: FSRS (use the `ts-fsrs` npm package rather than
  hand-rolling the math — it's a maintained reference implementation of the
  same algorithm Anki uses)

No custom backend server, no Edge Functions needed for v1 — all logic
(FSRS scheduling, queue building) runs client-side, with Supabase as the
data store. This keeps the architecture simple; revisit only if scaling
requires moving FSRS calculation server-side.

---

## 3. Data source

I will supply a file `characters.json` at the project root before any database
work starts, in this shape:

```json
[
  {
    "rank": 1,
    "char": "的",
    "pinyin": "de",
    "meaning": "(possessive/modifying particle); of; 's",
    "radical": "白",
    "radical_pinyin": "bái",
    "radical_meaning": "white",
    "mnemonic": "白 (white) + 勺 (ladle). The single most common character in Chinese...",
    "mnemonic_type": "H"
  }
]
```

`mnemonic_type` is `"C"` (component-based, structurally accurate) or `"H"`
(memory hook, used where etymology is opaque). 500 entries, ranks 1-500,
contiguous, no duplicate characters.

**Claude Code task**: write a one-off seed script (`scripts/seed-characters.ts`)
that reads `characters.json` and upserts it into the `characters` table (see
schema below). Do not hardcode character data into the seed script itself —
read from the JSON file. Do not invent or hallucinate character data; the
JSON file is the single source of truth for content.

---

## 4. Database schema (Supabase / Postgres)

```sql
-- Static reference data, same for all users
create table characters (
  id smallint primary key,        -- = rank, 1-500
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
-- No row = character not yet introduced to this user.
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
  state smallint not null default 0,        -- 0=New,1=Learning,2=Review,3=Relearning
  due timestamptz not null default now(),
  last_review timestamptz,

  created_at timestamptz not null default now(),
  unique (user_id, character_id)
);

-- Full review history, for stats/streaks and FSRS optimisation later
create table review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id smallint not null references characters(id),
  rating smallint not null check (rating between 1 and 4), -- 1=Again 2=Hard 3=Good 4=Easy
  reviewed_at timestamptz not null default now(),
  -- snapshot of FSRS state at time of review, for potential future re-optimisation
  state_before jsonb,
  state_after jsonb
);

-- One row per user, tracks daily new-card consumption and simple stats
create table user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_new_card_limit smallint not null default 8,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
```

### Row Level Security

Enable RLS on `user_cards`, `review_log`, `user_progress`. Policies: a user
may only `select`/`insert`/`update`/`delete` rows where `user_id = auth.uid()`.
`characters` is public read-only (RLS enabled, `select` allowed for any
authenticated user, no insert/update/delete from the client).

**Claude Code task**: write these as a Supabase migration
(`supabase/migrations/0001_init.sql`), including the RLS policies explicitly
written out, not just "enable RLS" — Claude Code should not skip writing the
actual policy statements.

---

## 5. Core app logic

### 5.1 Daily queue construction

On loading the "Study" screen for a logged-in user:

1. Query `user_cards` where `user_id = me` and `due <= now()`, ordered by
   `due` ascending → this is the **review queue**.
2. Count how many `user_cards` rows for this user have `created_at` today
   (i.e. how many new cards already introduced today) → compare against
   `user_progress.daily_new_card_limit`.
3. If under the cap, query `characters` for the lowest-rank characters that
   have **no** corresponding `user_cards` row for this user yet, up to
   `(daily_new_card_limit - already_introduced_today)` of them → this is the
   **new card batch**.
4. Combined session order: all due reviews first (by due date ascending),
   then the new-card batch at the end. New cards go through Learning Mode
   (see 5.2) before they're added to `user_cards` and become reviewable.

### 5.2 Learning Mode (first exposure)

For each character in the new-card batch, show a single full-detail card:

- Large hanzi
- Pinyin (with tone marks)
- English meaning
- Radical, with its own pinyin + meaning
- Mnemonic text
- Speaker icon button → plays pronunciation via Web Speech API
  (`utterance.lang = 'zh-CN'`, `utterance.text = char`)
- "Got it" button to advance to the next new character

After the user has stepped through all cards in the batch (no grading, pure
exposure — this is not a quiz), create a `user_cards` row for each with FSRS
default new-card state (use `ts-fsrs`'s default `createEmptyCard()` /
equivalent), `due = now()`, `state = New`. These are now eligible for review
starting from the next FSRS-computed interval (FSRS will typically schedule
the first review a few minutes to a day out, depending on configuration —
follow `ts-fsrs` defaults, don't override unless there's a clear reason).

### 5.3 Review Mode

For each card in the review queue, in order:

1. Show hanzi only (large, centered). Speaker icon available but pronunciation
   not shown as text yet.
2. User mentally recalls pinyin + meaning, then taps "Show answer."
3. Reveal pinyin, meaning, radical, mnemonic (same detail as Learning Mode —
   reinforces the memory device on every review, not just first exposure).
4. Four grading buttons: **Again / Hard / Good / Easy**.
5. On grading, call `ts-fsrs`'s scheduler with the card's current FSRS state
   and the chosen rating, get back the updated state, write it to `user_cards`
   (update `stability`, `difficulty`, `due`, `scheduled_days`, `reps`,
   `lapses`, `state`, `last_review`), and insert a row into `review_log`.
6. Advance to the next card in the queue. End of queue → session summary
   screen (see 5.4).

### 5.4 Session summary

After a study session (queue exhausted): show count of reviews done, new
cards learned, and a simple "characters known" count — define "known" as
`user_cards` rows where `state IN (2,3)` (Review/Relearning, i.e. has graduated
past initial learning) AND `stability >= some reasonable threshold` (use
FSRS's own retrievability calculation at "now" — show characters where
predicted retrievability is currently above, say, 0.7 — rather than inventing
an arbitrary separate metric). Use `ts-fsrs`'s built-in retrievability
function for this rather than recalculating it by hand.

### 5.5 Dashboard / home screen

On login, before entering a study session, show:
- Total characters introduced so far / 500
- Due reviews count for today
- New cards available today (respecting daily cap)
- Simple streak counter (consecutive days with at least one review or new
  card logged) — derive from `review_log` / `user_cards.created_at` dates in
  the user's local timezone (stored in `user_progress.timezone`), don't
  overengineer this into a separate streak table for v1.
- A settings control to adjust `daily_new_card_limit` (default 8, editable,
  reasonable range 1-30)
- "Start studying" button → goes into the combined queue from 5.1

---

## 6. Pages / routes

- `/login` — Supabase Auth UI (email/password + magic link). Use
  `@supabase/auth-ui-react` if it fits cleanly, otherwise a minimal custom
  form calling `supabase.auth.signInWithPassword` /
  `supabase.auth.signInWithOtp` — Claude Code's call on which is less friction
  to implement correctly.
- `/` (dashboard) — described in 5.5. Redirect to `/login` if not
  authenticated.
- `/study` — the combined Learning + Review session (5.1-5.4). Redirect to
  `/` if there's nothing due and no new cards available, with a friendly
  "all caught up" message rather than a blank screen.
- `/browse` (optional but nice-to-have, build it if time allows, not a
  blocker) — a searchable grid/list of all 500 characters showing per-user
  status (not started / learning / due / known), reusing the same character
  detail view as a click-to-expand. Treat as P2 — get auth, schema, learning
  mode, and review mode solid first.

---

## 7. Non-goals for v1 (explicitly out of scope — do not build)

- Production-direction testing (English → hanzi recall) — recognition only
- Cloud/premium TTS — Web Speech API only
- Multi-device conflict resolution beyond what Supabase gives for free
- Admin panel, multi-deck support, importing other character sets
- Mobile native app — responsive web only
- Leaderboards / social features
- Editing or contributing mnemonics from the UI

If any of these seem like they'd take less than a few minutes as a side
effect of other work, fine — but don't go out of the way to build them.

---

## 8. Environment / deployment

- Supabase project: I will create this and provide `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` as environment variables. Claude Code should structure
  the app to read these from `import.meta.env.VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` and fail with a clear error message at startup if
  missing, rather than failing silently or crashing deep in a component.
- `.env.example` file committed with placeholder values; real `.env` gitignored.
- Vercel deployment: standard Vite static build (`vercel.json` only if Vite's
  default detection needs help — try without first).
- Supabase migrations should be runnable via the Supabase CLI
  (`supabase db push` or equivalent) — write them as proper migration files,
  not as instructions to paste into the SQL editor by hand.

---

## 9. Build order (suggested phases for Claude Code to work through)

1. Scaffold Vite + React + TS + Tailwind. Get a blank deployable app on
   Vercel first, before any feature work — confirms the pipeline works.
2. Supabase project wiring: client setup, auth context/hook, login/signup
   flow, protected routes.
3. Schema migration + RLS policies. Seed script for `characters` table from
   `characters.json`.
4. Dashboard screen with real counts (even if Learning/Review aren't built
   yet, the queries can be written and tested against seeded data).
5. Learning Mode flow end-to-end (display new cards, "Got it" → create
   `user_cards` rows with FSRS defaults).
6. Review Mode flow end-to-end (display due cards, grade, FSRS update via
   `ts-fsrs`, write back to `user_cards` + `review_log`).
7. Combined queue logic tying 5 and 6 together as one session.
8. Session summary screen, streak counter, settings control for daily cap.
9. Polish: loading states, empty states ("all caught up"), error handling on
   Supabase calls, basic responsive layout check.
10. `/browse` page if time allows.

At each phase, prefer a working vertical slice over a polished partial layer
— e.g. phase 5 should result in something I can actually click through in a
browser, not just components in isolation.

---

## 10. Open questions Claude Code should ask me, not assume

- Exact color palette / visual style (no brand guidelines given — use clean,
  legible defaults, optimise for CJK readability, e.g. ensure a proper CJK
  font is loaded, don't rely on system default sans-serif alone)
- Whether magic link emails need custom Supabase email templates (default
  Supabase templates are fine for v1 unless told otherwise)
- Any specific FSRS parameter tuning (use library defaults; don't hand-tune
  weights without discussing it first)

---

## 11. Definition of done for v1

A deployed Vercel URL where I can:
1. Sign up / log in with email
2. See a dashboard with accurate counts (0 known, 0 due, N new available, on
   first login)
3. Run a Learning Mode session that introduces up to my daily cap of new
   characters with full mnemonic detail and audio
4. Have those characters show up for review on subsequent days per FSRS
   scheduling, grade them with the 4 buttons, and see their due dates move
   sensibly (Again → due soon, Easy → due much later)
5. See my "characters known" count increase over time as cards mature
6. Close the tab and come back later (even on a different device, same
   login) and have all progress intact, because it's in Supabase, not local
   storage
