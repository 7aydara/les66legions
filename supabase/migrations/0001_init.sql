-- Les 66 Légions — schéma initial.
-- Idempotent : peut être rejoué sans risque (npm run db:migrate, SQL editor Supabase ou supabase db push).
--
-- Convention de temps : toutes les colonnes *_at / *_until en float8 sont des « secondes de jeu »
-- (gt), comptées depuis le clic « Lancer » et gelées pendant les pauses. Les colonnes timestamptz
-- sont de l'heure murale (journal, liaison des badges).
--
-- RLS activée partout, aucune policy : seul le serveur (service role / connexion directe) lit et écrit.

create table if not exists game (
  id int primary key default 1 check (id = 1),
  phase text not null default 'lobby'
    check (phase in ('lobby','roles','intro','act1','act2','act3','verdict','finale')),
  act int not null default 0,
  launched boolean not null default false,
  launched_at timestamptz,
  paused boolean not null default false,
  clock_gt float8 not null default 0,            -- secondes de jeu au moment clock_wall
  clock_wall timestamptz not null default now(),
  settings jsonb not null default '{}'::jsonb,   -- surcharge des réglages par défaut (lib/game/settings.ts)
  screen_state jsonb not null default '{}'::jsonb,
  conclave_cooldown_until float8 not null default 0,
  kills_open boolean not null default false,
  mission_progress float8 not null default 0,
  flags jsonb not null default '{}'::jsonb,
  channel_secrets jsonb not null default '{}'::jsonb,
  last_tick_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  badge_code text not null unique,
  token text not null unique,
  channel_key text not null unique,
  bound_at timestamptz,
  name text,
  role text,
  camp text check (camp in ('legion','neutral','witness')),
  status text not null default 'alive' check (status in ('alive','corpse','spirit','expelled')),
  death_cause text,                               -- murder | vote | mj
  died_at float8,
  zone text,
  evacuated_until float8 not null default 0,
  bell_used boolean not null default false,
  flags jsonb not null default '{}'::jsonb,
  metals text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists power_uses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  power text not null,
  act int not null,
  target_id uuid references players(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  at float8 not null
);

create table if not exists kills (
  id uuid primary key default gen_random_uuid(),
  killer_id uuid references players(id) on delete set null,
  target_id uuid references players(id) on delete set null,   -- badge scanné
  victim_id uuid references players(id) on delete set null,   -- victime réelle (Garde du corps en v2)
  scanned_at float8 not null,
  dies_at float8 not null,
  zone text,
  blocked_reason text,
  resolved boolean not null default false,
  resolved_at float8
);
create index if not exists kills_pending_idx on kills (resolved, dies_at);

create table if not exists missions (
  code text primary key,
  zone text,
  kind text not null check (kind in ('witness','spirit')),
  validated_by uuid references players(id) on delete set null,
  validated_at float8
);

create table if not exists mission_scans (
  id uuid primary key default gen_random_uuid(),
  mission_code text not null references missions(code) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  answer text,
  correct boolean not null default false,
  counted boolean not null default false,
  at float8 not null
);
create index if not exists mission_scans_code_idx on mission_scans (mission_code, at desc);

create table if not exists mission_locks (
  player_id uuid not null references players(id) on delete cascade,
  mission_code text not null references missions(code) on delete cascade,
  attempts int not null default 0,
  locked_until float8 not null default 0,
  primary key (player_id, mission_code)
);

create table if not exists clues (
  code text primary key,
  act int,
  title text not null,
  body text not null default '',
  image text,
  visibility jsonb not null default '"public"'::jsonb,
  variants jsonb not null default '{}'::jsonb,
  is_fake boolean not null default false,
  author_id uuid references players(id) on delete set null,
  created_at float8
);

create table if not exists player_clues (
  player_id uuid not null references players(id) on delete cascade,
  clue_code text not null references clues(code) on delete cascade,
  delivered_at float8 not null,
  primary key (player_id, clue_code)
);

create table if not exists councils (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('report','bell','office','accusation','mj')),
  caller_id uuid references players(id) on delete set null,
  corpse_ids jsonb not null default '[]'::jsonb,
  stage text not null check (stage in ('glas','debate','vote','count','result','expulsion','closed')),
  stage_ends_at float8 not null,
  debate_seconds float8 not null,
  opened_at float8 not null,
  closed_at float8,
  result jsonb
);

create table if not exists votes (
  council_id uuid not null references councils(id) on delete cascade,
  voter_id uuid not null references players(id) on delete cascade,
  target_id uuid references players(id) on delete cascade,   -- null = « personne »
  weight int not null default 1,
  at float8 not null,
  primary key (council_id, voter_id)
);

create table if not exists chastisements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  council_id uuid references councils(id) on delete set null,
  kind text not null check (kind in ('baillon','aveugle','confession','marque','exil')),
  starts_at float8 not null,
  ends_at float8,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists fragments (
  code text primary key,
  state text not null default 'inactive' check (state in ('inactive','active','saved','burned')),
  scanned_by uuid references players(id) on delete set null,
  scanned_at float8
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,          -- conclave | medium | confession | mj_alchimiste ...
  from_id uuid references players(id) on delete set null,
  to_id uuid references players(id) on delete set null,
  body text not null,
  meta jsonb not null default '{}'::jsonb,
  at float8 not null
);

create table if not exists scheduled_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,             -- phase | kills_open | council | flash | fragments
  label text not null,
  at float8 not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','done','skipped','cancelled')),
  done_at float8,
  note text
);
create index if not exists scheduled_events_pending_idx on scheduled_events (status, at);

create table if not exists verdict_answers (
  player_id uuid primary key references players(id) on delete cascade,
  answers jsonb not null,
  at float8 not null
);

create table if not exists event_log (
  id bigserial primary key,
  at float8,                      -- secondes de jeu (null avant le lancement)
  wall_at timestamptz not null default now(),
  actor_id uuid references players(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb
);

alter table game enable row level security;
alter table players enable row level security;
alter table power_uses enable row level security;
alter table kills enable row level security;
alter table missions enable row level security;
alter table mission_scans enable row level security;
alter table mission_locks enable row level security;
alter table clues enable row level security;
alter table player_clues enable row level security;
alter table councils enable row level security;
alter table votes enable row level security;
alter table chastisements enable row level security;
alter table fragments enable row level security;
alter table messages enable row level security;
alter table scheduled_events enable row level security;
alter table verdict_answers enable row level security;
alter table event_log enable row level security;
