-- Configuration de l'application qui doit survivre aux resets de partie.
-- mj_password_hash : mot de passe du panneau MJ (scrypt). Prioritaire sur la variable MJ_PASSWORD,
-- ce qui permet de le changer sans redéployer (npm run mj:password).
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;
