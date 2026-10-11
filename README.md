# Les 66 Légions

Plateforme du jeu grandeur nature d'Halloween (30 joueurs + 1 MJ). La spécification complète est dans [`SPEC.md`](SPEC.md). Ce dépôt contient le **jalon v1 : le squelette jouable**.

| Surface | Route | Pour qui |
| --- | --- | --- |
| Interface joueur | `/play` | Téléphones des joueurs |
| Écran principal | `/screen` | TV / vidéoprojecteur 1920×1080 |
| Panneau MJ | `/mj` | Laptop du MJ (mot de passe `MJ_PASSWORD`) |
| QR codes | `/q/[code]` | Tout scan |

## Contenu du v1

- Schéma Supabase complet (`supabase/migrations/0001_init.sql`), avec RLS activée sur toutes les tables et aucune policy.
- Badges et cookie : le premier scan d'un badge lie le téléphone (cookie httpOnly contenant le token). Un badge déjà lié est refusé ; le MJ peut le délier ou transférer le joueur sur un badge de rechange (B31–B34).
- Lobby (prénom), attribution des rôles de 22 à 30 joueurs (ordre de retrait du MJ, Asmodée retiré sous 25), ou sélection manuelle.
- Interface rôle : nom, camp, objectif, pouvoirs (descriptifs). Les agents de la Légion voient leurs alliés ; le Frère voit le Templier.
- Scanner (`html5-qrcode`, avec saisie manuelle en secours), meurtre différé (90 s), cooldown partagé du Conclave, choix de la zone à la mort.
- Signalement, cloche d'urgence, conseil (glas, débat, vote, dépouillement, fenêtre de 30 s, expulsion).
- Missions : 3 essais puis verrou de 2 min ; les réponses de la Légion ne comptent jamais. Jauge des missions.
- Écran : modes veille, glas, conseil, expulsion, avec le bandeau permanent.
- Panneau MJ minimal :
  - le tick (1 s), lancer, pause et reset ;
  - le tableau des joueurs, avec tuer, ressusciter et changer de rôle ;
  - la timeline (décaler, déclencher, annuler) ;
  - les réglages, le forçage de l'écran et le journal ;
  - les alertes de victoire immédiate.
- `npm run qr` : PDF d'impression de tous les QR codes. `npm run bots` : partie simulée de bout en bout.

Le v2 couvre les pouvoirs, les châtiments, les Esprits et le Médium, les Éclipses, les indices, les missions éclair, les fragments et le verdict. Le v3 couvre les animations, les sons, le bouton « Cacher » et la robustesse.

### Règles précisées par le MJ (appliquées dans le code)

- **T+0 = « Lancer » = début de la vidéo d'intro.** Le lobby et les rôles se font avant. La timeline de la spec est décalée de −15 min (acte 1 à T+0:07, premier meurtre à T+0:15, etc.).
- **Meurtres bloqués du Glas à la fin du conseil.** Une mort différée qui tomberait pendant un conseil est reportée à la clôture + 30 s.
- **Vote** :
  - « personne » compte comme voix exprimée ; s'il est en tête, il n'y a pas d'expulsion ;
  - le dénominateur utilise les poids réels (Frère ×2) ;
  - un joueur ne peut pas voter contre lui-même, mais peut changer son vote ;
  - en v2, les votes contre un Baal invisible compteront comme « personne ».
- **Glas** : « Corps signalé par X » / « Cloche sonnée par X » ; tous les corps sont listés ; un conseil d'office affiche « Le conseil de minuit est convoqué ».
- **Écran** : les corps pas encore découverts comptent parmi les vivants, pour que l'écran ne trahisse pas un meurtre.

### Choix techniques

- **Toute la logique est côté serveur** (`lib/game/engine.ts`). Chaque action passe par une transaction qui verrouille la ligne `game` (`FOR UPDATE`). Les actions sont donc sérialisées, et le tick est idempotent (testé avec des appels simultanés).
- **Les clients ne lisent jamais les tables.** Ils reçoivent des vues filtrées (`lib/game/views.ts`). Aucune vue ne contient le rôle d'un autre joueur : c'est vérifié par les tests et à chaque étape du script de bots.
- **Realtime** : Supabase Broadcast transporte seulement un signal « refresh » sur `screen`, `player:{clé}` et `mj:{secret}` ; le client recharge alors sa vue. Sans Supabase configuré, les clients sondent l'API toutes les 2–3 s.
- **Horloge en secondes de jeu** depuis « Lancer », gelée pendant la pause. Les morts différées, les cooldowns et les chronos sont exprimés dans cette horloge.
- **Base de données** : `DATABASE_URL` accepte `postgres://…` (Supabase, via postgres.js) ou `pglite:<dossier>` (Postgres embarqué, pour le développement sans Docker).
- **Textes de jeu** : tous dans `content/`. Les placeholders à remplacer sont marqués `TODO_TEXTE`.

## Lancer en local

Il faut Node 20 ou plus récent.

```bash
npm install
cp .env.example .env.local      # puis éditer MJ_PASSWORD
npm run dev                      # http://localhost:3000
```

Par défaut, `DATABASE_URL=pglite:./.pglite` : la base est un dossier local, créée et migrée automatiquement. Ni Docker ni compte Supabase ne sont nécessaires.

- MJ : ouvre `http://localhost:3000/mj`.
- Écran : ouvre `/screen` dans une autre fenêtre.
- Joueur sans téléphone : ouvre `http://localhost:3000/q/B01` (lie le badge B01 au navigateur). Une fenêtre de navigation privée permet de simuler un autre joueur, par exemple avec `/q/B02`.

### Tester avec de vrais téléphones (Wi-Fi local)

```bash
npm run dev -- -H 0.0.0.0
```

Mets `NEXT_PUBLIC_BASE_URL=http://<IP-du-laptop>:3000` dans `.env.local`, puis génère les QR (voir plus bas). En HTTP, la caméra du navigateur est souvent bloquée : la saisie manuelle du code reste disponible. Sinon, déploie sur Vercel (HTTPS).

### Tests

```bash
npm test                         # tests unitaires + moteur (PGlite en mémoire)
TEST_DATABASE_URL=postgres://…/base_jetable npm test   # même chose sur un vrai Postgres (la base est VIDÉE)
npm run typecheck && npm run lint
```

### Partie simulée par 30 bots

Dans un premier terminal :

```bash
ALLOW_TIME_WARP=1 npm run dev    # ou: npm run build && ALLOW_TIME_WARP=1 npm start
```

Dans un second terminal :

```bash
npm run bots                     # 30 joueurs
BOT_PLAYERS=24 npm run bots      # 24 joueurs (4 agents)
BOT_SEED=42 npm run bots         # partie rejouable
```

Le script :

- réinitialise la partie ;
- lie 30 badges comme de vrais téléphones (`/q/Bxx`) et saisit les prénoms ;
- attribue les rôles et lance la partie ;
- avance l'horloge par pas de 5 s ;
- fait agir les bots uniquement via les routes joueur : meurtres, signalements, cloches, conseils et votes, missions (dont des erreurs volontaires).

Il vérifie à chaque étape qu'aucune vue ne trahit un rôle. Il échoue (code de sortie 1) en cas d'erreur serveur, de fuite de rôle ou d'événement non traité. Une partie complète prend environ 1 minute.

> ⚠ `ALLOW_TIME_WARP=1` permet de sauter dans le temps depuis le panneau MJ : ne l'active jamais le soir de la partie.

### QR codes à imprimer

```bash
NEXT_PUBLIC_BASE_URL=https://ton-domaine.fr npm run qr   # → qr/qr-print.pdf
```

Le PDF est en A4 avec traits de coupe et correction d'erreur H :

| Catégorie | Format |
| --- | --- |
| Badges | 85×55 mm, 8 par page |
| Missions et Esprits | A6 |
| Indices | A5 |
| Zones | A4 |
| Fragments | 40×40 mm, sans texte |

Régénère le PDF dès que le domaine définitif est connu.

## Déployer sur Vercel + Supabase

1. **Supabase** : crée un projet, puis applique le schéma, au choix :
   - colle `supabase/migrations/0001_init.sql` dans le *SQL Editor* ;
   - lance `DATABASE_URL=… npm run db:migrate` ;
   - lance `supabase db push`.

   La migration est idempotente.
2. Récupère dans Supabase :
   - *Project Settings → Database → Connection string → Transaction pooler* (port **6543**) : c'est `DATABASE_URL` ;
   - *Project Settings → API* : l'URL donne `NEXT_PUBLIC_SUPABASE_URL`, la clé `anon` donne `NEXT_PUBLIC_SUPABASE_ANON_KEY` et la clé `service_role` donne `SUPABASE_SERVICE_ROLE_KEY` (secrète, serveur uniquement).
3. **Vercel** : importe le dépôt (framework Next.js détecté automatiquement), puis ajoute ces variables d'environnement :

   | Variable | Valeur |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://postgres.xxx:…@….pooler.supabase.com:6543/postgres` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé service_role |
   | `MJ_PASSWORD` | mot de passe du panneau MJ |
   | `NEXT_PUBLIC_BASE_URL` | `https://ton-domaine.fr` (URL finale) |

   Ne mets **pas** `ALLOW_TIME_WARP`, sauf sur un déploiement de répétition.
4. Déploie. Ouvre `/mj` (la partie s'initialise au premier appel), puis `/screen` sur la TV.
5. Génère les QR avec l'URL de prod (`npm run qr`) et imprime.
6. Pour une répétition sur le déploiement : ajoute temporairement `ALLOW_TIME_WARP=1`, puis lance `BOT_BASE_URL=https://… MJ_PASSWORD=… npm run bots`.

> Le soir de la partie, le panneau MJ doit rester ouvert : c'est lui qui appelle `/api/tick` chaque seconde.

## Arborescence

```
app/              pages (play, screen, mj), routes API, /q/[code]
lib/db.ts         accès Postgres (postgres.js) / PGlite
lib/realtime.ts   diffusion Supabase Broadcast (signaux « refresh »)
lib/auth.ts       cookies joueur / MJ
lib/game/         moteur (engine), vues filtrées (views), dépouillement (tally),
                  attribution (assign), timeline, réglages, horloge
content/          tous les textes de jeu (TODO_TEXTE)
supabase/         migrations SQL
scripts/          bots.ts, generate-qr.ts, migrate.ts
tests/            vitest (logique pure + moteur sur PGlite/Postgres)
```
