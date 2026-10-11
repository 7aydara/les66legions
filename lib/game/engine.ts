// Moteur de jeu : toute la logique côté serveur. Chaque action mutante passe par withGame(),
// qui ouvre une transaction et verrouille la ligne `game` (FOR UPDATE) : les actions sont donc
// sérialisées, ce qui rend le tick idempotent et évite les courses (deux meurtres simultanés…).
import { randomBytes } from "node:crypto";
import { ROLE_BY_ID, isRoleId, type RoleId } from "@/content/roles";
import { MISSIONS, MISSION_BY_CODE } from "@/content/missions";
import { ZONE_CODES } from "@/content/zones";
import { TEXTS } from "@/content/texts";
import type { Database, Db } from "@/lib/db";
import { broadcast, type Notify } from "@/lib/realtime";
import { rolesForCount, shuffle } from "./assign";
import { gameNow } from "./clock";
import { GameError } from "./errors";
import { normalizeAnswer } from "./normalize";
import { mergeSettings, type Settings } from "./settings";
import { tally } from "./tally";
import { ACT_PHASES, DEFAULT_TIMELINE, PHASE_ACT, type Phase } from "./timeline";
import type { CouncilRow, CouncilTrigger, EventRow, GameRow, KillRow, PlayerRow } from "./types";

export const BADGE_CODES = Array.from({ length: 34 }, (_, i) => `B${String(i + 1).padStart(2, "0")}`);
export const FRAGMENT_CODES = ["F-MENE", "F-TEKEL", "F-UPHARSIN"];

export interface Ctx {
  db: Db;
  game: GameRow;
  now: number;
  settings: Settings;
  notify: Notify;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url"); // 32 caractères
}

function emptyNotify(): Notify {
  return { screen: false, everyone: false, players: new Set(), mj: true };
}

/** Exécute fn dans une transaction avec la partie verrouillée, puis diffuse les notifications. */
export async function withGame<T>(database: Database, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const notify = emptyNotify();
  const result = await database.tx(async (db) => {
    const [game] = await db.query<GameRow>("select * from game where id = 1 for update");
    if (!game) throw new GameError("Partie non initialisée", 503);
    const ctx: Ctx = { db, game, now: gameNow(game), settings: mergeSettings(game.settings), notify };
    return fn(ctx);
  });
  await broadcast(database, notify).catch((e) => console.error("broadcast", e));
  return result;
}

export async function log(ctx: Pick<Ctx, "db" | "game" | "now">, kind: string, payload: Record<string, unknown> = {}, actorId: string | null = null) {
  await ctx.db.query("insert into event_log (at, actor_id, kind, payload) values ($1, $2, $3, $4::jsonb)", [
    ctx.game.launched ? ctx.now : null,
    actorId,
    kind,
    JSON.stringify(payload),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Initialisation et réinitialisation

export async function ensureInitialized(database: Database) {
  const rows = await database.query("select 1 from game where id = 1");
  if (rows.length === 0) await resetGame(database, { keepPlayers: false });
}

/**
 * keepPlayers = true : on garde les badges liés et les prénoms, on efface rôles et état de partie.
 * keepPlayers = false : tout est effacé, les tokens sont régénérés (les téléphones doivent re-scanner).
 */
export async function resetGame(database: Database, opts: { keepPlayers: boolean }) {
  await database.tx(async (db) => {
    await db.query("select pg_advisory_xact_lock(6666)");
    const [old] = await db.query<GameRow>("select * from game where id = 1 for update");
    for (const t of ["event_log", "votes", "councils", "kills", "power_uses", "mission_scans", "mission_locks", "missions",
      "player_clues", "clues", "chastisements", "fragments", "messages", "scheduled_events", "verdict_answers"]) {
      await db.query(`delete from ${t}`);
    }
    if (opts.keepPlayers) {
      await db.query(`update players set role = null, camp = null, status = 'alive', death_cause = null, died_at = null,
        zone = null, evacuated_until = 0, bell_used = false, flags = '{}'::jsonb, metals = '{}'`);
    } else {
      await db.query("delete from players");
      for (const code of BADGE_CODES) {
        await db.query("insert into players (badge_code, token, channel_key) values ($1, $2, $3)", [code, newToken(), newToken()]);
      }
    }
    const secrets = { mj: newToken(), legion: newToken(), spirits: newToken() };
    const settings = opts.keepPlayers && old ? old.settings : {};
    await db.query(
      `insert into game (id, phase, act, launched, launched_at, paused, clock_gt, clock_wall, settings, screen_state,
         conclave_cooldown_until, kills_open, mission_progress, flags, channel_secrets, last_tick_at, updated_at)
       values (1, 'lobby', 0, false, null, false, 0, now(), $1::jsonb, '{}'::jsonb, 0, false, 0, '{}'::jsonb, $2::jsonb, null, now())
       on conflict (id) do update set phase = excluded.phase, act = 0, launched = false, launched_at = null, paused = false,
         clock_gt = 0, clock_wall = now(), settings = excluded.settings, screen_state = '{}'::jsonb,
         conclave_cooldown_until = 0, kills_open = false, mission_progress = 0, flags = '{}'::jsonb,
         channel_secrets = excluded.channel_secrets, last_tick_at = null, updated_at = now()`,
      [JSON.stringify(settings), JSON.stringify(secrets)],
    );
    for (const m of MISSIONS) await db.query("insert into missions (code, zone, kind) values ($1, $2, $3)", [m.code, m.zone, m.kind]);
    for (const f of FRAGMENT_CODES) await db.query("insert into fragments (code) values ($1)", [f]);
    for (const e of DEFAULT_TIMELINE) {
      await db.query("insert into scheduled_events (kind, label, at, payload) values ($1, $2, $3, $4::jsonb)", [
        e.kind, e.label, e.at, JSON.stringify(e.payload),
      ]);
    }
    await db.query("insert into event_log (kind, payload) values ('reset', $1::jsonb)", [JSON.stringify(opts)]);
  });
  await broadcast(database, { screen: true, everyone: true, players: new Set(), mj: true }).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Helpers

export async function playerByToken(db: Db, token: string | undefined | null): Promise<PlayerRow | null> {
  if (!token) return null;
  const [p] = await db.query<PlayerRow>("select * from players where token = $1", [token]);
  return p ?? null;
}

async function requireMe(ctx: Ctx, token: string): Promise<PlayerRow> {
  const me = await playerByToken(ctx.db, token);
  if (!me) throw new GameError("Badge inconnu : scanne ton badge.", 401);
  return me;
}

async function playerById(db: Db, id: string): Promise<PlayerRow> {
  const [p] = await db.query<PlayerRow>("select * from players where id = $1", [id]);
  if (!p) throw new GameError("Joueur introuvable", 404);
  return p;
}

async function playerByBadge(db: Db, badge: string): Promise<PlayerRow | null> {
  const [p] = await db.query<PlayerRow>("select * from players where badge_code = $1", [badge.toUpperCase()]);
  return p ?? null;
}

export async function openCouncil(db: Db): Promise<CouncilRow | null> {
  const [c] = await db.query<CouncilRow>("select * from councils where closed_at is null order by opened_at desc limit 1");
  return c ?? null;
}

const isAct = (phase: Phase) => ACT_PHASES.includes(phase);
const isEvacuated = (p: PlayerRow, now: number) => p.evacuated_until > now;
const voteWeight = (p: PlayerRow) => (p.role === "frere" ? 2 : 1);

function addAlert(ctx: Ctx, kind: string, text: string) {
  const alerts = ctx.game.flags.alerts ?? [];
  if (alerts.some((a) => a.kind === kind)) return false;
  alerts.push({ kind, at: ctx.now, text });
  ctx.game.flags.alerts = alerts;
  return true;
}

async function saveFlags(ctx: Ctx) {
  await ctx.db.query("update game set flags = $1::jsonb, updated_at = now() where id = 1", [JSON.stringify(ctx.game.flags)]);
}

// ---------------------------------------------------------------------------------------------
// Badges et lobby

/** Premier scan d'un badge sans cookie : lie ce badge au téléphone. Retourne le token à poser en cookie. */
export async function bindBadge(database: Database, badge: string): Promise<{ token: string } | { error: "unknown" | "taken" }> {
  return withGame(database, async (ctx) => {
    const p = await playerByBadge(ctx.db, badge);
    if (!p) return { error: "unknown" as const };
    if (p.bound_at) return { error: "taken" as const };
    await ctx.db.query("update players set bound_at = now() where id = $1", [p.id]);
    await log(ctx, "badge_bound", { badge: p.badge_code }, p.id);
    return { token: p.token };
  });
}

export async function setName(database: Database, token: string, rawName: string) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    const name = String(rawName ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 30) throw new GameError("Prénom : 1 à 30 caractères.");
    if (ctx.game.launched && me.name) throw new GameError("La partie est lancée : demande au MJ pour changer de prénom.");
    await ctx.db.query("update players set name = $1 where id = $2", [name, me.id]);
    await log(ctx, "name_set", { badge: me.badge_code, name }, me.id);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------------------------
// MJ : rôles, lancement, pause

export async function assignRoles(database: Database, opts: { roles?: string[] } = {}) {
  return withGame(database, async (ctx) => {
    if (ctx.game.launched) throw new GameError("La partie est déjà lancée.");
    const bound = await ctx.db.query<PlayerRow>("select * from players where bound_at is not null order by badge_code");
    const unnamed = bound.filter((p) => !p.name);
    if (unnamed.length) throw new GameError(`Badges liés sans prénom : ${unnamed.map((p) => p.badge_code).join(", ")} (délie-les ou attends).`);
    let roles: RoleId[];
    if (opts.roles && opts.roles.length) {
      if (!opts.roles.every(isRoleId)) throw new GameError("Rôle inconnu dans la sélection.");
      if (new Set(opts.roles).size !== opts.roles.length) throw new GameError("Rôle en double dans la sélection.");
      if (opts.roles.length !== bound.length) throw new GameError(`Sélection de ${opts.roles.length} rôles pour ${bound.length} joueurs.`);
      roles = opts.roles as RoleId[];
    } else {
      try {
        roles = rolesForCount(bound.length);
      } catch (e) {
        throw new GameError((e as Error).message);
      }
    }
    const shuffled = shuffle(roles);
    for (let i = 0; i < bound.length; i++) await applyRole(ctx.db, bound[i].id, shuffled[i]);
    await ctx.db.query("update game set phase = 'roles', updated_at = now() where id = 1");
    await log(ctx, "roles_assigned", { count: bound.length, manual: !!opts.roles?.length });
    ctx.notify.everyone = ctx.notify.screen = true;
    return { ok: true, count: bound.length };
  });
}

async function applyRole(db: Db, playerId: string, role: RoleId) {
  const def = ROLE_BY_ID[role];
  await db.query("update players set role = $1, camp = $2, metals = string_to_array($3, ',') where id = $4", [
    role, def.camp, def.metal ?? "", playerId,
  ]);
}

export async function setRole(database: Database, playerId: string, role: string) {
  return withGame(database, async (ctx) => {
    if (!isRoleId(role)) throw new GameError("Rôle inconnu");
    const p = await playerById(ctx.db, playerId);
    await applyRole(ctx.db, p.id, role);
    await log(ctx, "mj_set_role", { badge: p.badge_code, from: p.role, to: role });
    ctx.notify.players.add(p.channel_key);
    ctx.notify.everyone = true; // les alliés de la Légion peuvent changer
    return { ok: true };
  });
}

export async function unbindBadge(database: Database, playerId: string) {
  return withGame(database, async (ctx) => {
    const p = await playerById(ctx.db, playerId);
    if (p.role && ctx.game.launched) throw new GameError("Joueur en jeu : utilise plutôt « transférer ».");
    await ctx.db.query("update players set bound_at = null, name = null, role = null, camp = null, token = $1, channel_key = $2 where id = $3", [
      newToken(), newToken(), p.id,
    ]);
    await log(ctx, "mj_unbind", { badge: p.badge_code });
    return { ok: true };
  });
}

/** Badge perdu / téléphone changé : le joueur passe sur un badge de rechange libre (nouveau token). */
export async function transferBadge(database: Database, playerId: string, newBadge: string) {
  return withGame(database, async (ctx) => {
    const p = await playerById(ctx.db, playerId);
    const spare = await playerByBadge(ctx.db, newBadge);
    if (!spare) throw new GameError("Badge de rechange inconnu");
    if (spare.bound_at) throw new GameError("Ce badge est déjà lié");
    // Le joueur garde son id (et tout son historique) ; on échange les badge_code.
    await ctx.db.query("update players set badge_code = $1 where id = $2", [`TMP-${p.id}`, p.id]);
    await ctx.db.query("update players set badge_code = $1 where id = $2", [p.badge_code, spare.id]);
    await ctx.db.query("update players set badge_code = $1, token = $2, bound_at = null where id = $3", [spare.badge_code, newToken(), p.id]);
    await log(ctx, "mj_transfer", { from: p.badge_code, to: spare.badge_code, name: p.name });
    return { ok: true };
  });
}

export async function launch(database: Database) {
  return withGame(database, async (ctx) => {
    if (ctx.game.launched) throw new GameError("Déjà lancée.");
    if (ctx.game.phase !== "roles") throw new GameError("Attribue d'abord les rôles.");
    await ctx.db.query("update game set launched = true, launched_at = now(), paused = false, clock_gt = 0, clock_wall = now(), updated_at = now() where id = 1");
    ctx.game.launched = true;
    ctx.game.clock_gt = 0;
    ctx.now = 0;
    await log(ctx, "launch");
    await runTick(ctx);
    ctx.notify.everyone = ctx.notify.screen = true;
    return { ok: true };
  });
}

export async function setPaused(database: Database, paused: boolean) {
  return withGame(database, async (ctx) => {
    if (!ctx.game.launched) throw new GameError("Partie non lancée.");
    if (ctx.game.paused === paused) return { ok: true };
    // On fige clock_gt à « maintenant » dans les deux cas : la pause gèle, la reprise repart d'ici.
    await ctx.db.query("update game set paused = $1, clock_gt = $2, clock_wall = now(), updated_at = now() where id = 1", [paused, ctx.now]);
    await log(ctx, paused ? "pause" : "resume");
    ctx.notify.everyone = ctx.notify.screen = true;
    return { ok: true };
  });
}

/** Avance l'horloge de jeu (répétitions et bots uniquement : ALLOW_TIME_WARP=1). */
export async function warp(database: Database, seconds: number) {
  if (process.env.ALLOW_TIME_WARP !== "1") throw new GameError("Saut dans le temps désactivé (ALLOW_TIME_WARP).", 403);
  if (!(seconds > 0 && seconds <= 3600)) throw new GameError("Durée invalide");
  return withGame(database, async (ctx) => {
    if (!ctx.game.launched) throw new GameError("Partie non lancée.");
    await ctx.db.query("update game set clock_gt = clock_gt + $1 where id = 1", [seconds]);
    ctx.game.clock_gt += seconds;
    ctx.now += seconds;
    await runTick(ctx);
    return { ok: true, now: ctx.now };
  });
}

export async function updateSettings(database: Database, patch: Record<string, unknown>) {
  return withGame(database, async (ctx) => {
    const next = mergeSettings({ ...ctx.game.settings, ...patch });
    await ctx.db.query("update game set settings = $1::jsonb where id = 1", [JSON.stringify(next)]);
    await log(ctx, "mj_settings", patch);
    return { ok: true, settings: next };
  });
}

// ---------------------------------------------------------------------------------------------
// Scanner

export type ScanAction = { id: "kill" | "report"; label: string; enabled: boolean; reason?: string };

export type ScanResult =
  | { kind: "self" }
  | { kind: "player"; target: { badge: string; name: string }; actions: ScanAction[] }
  | { kind: "zone"; zone: string }
  | { kind: "mission"; code: string; validated: boolean; lockedUntil: number; attemptsLeft: number; counted: boolean }
  | { kind: "info"; message: string };

export async function scan(database: Database, token: string, rawCode: string): Promise<ScanResult> {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    const code = String(rawCode ?? "").trim().toUpperCase();
    if (!me.role) throw new GameError("La partie n'a pas encore commencé.");
    if (me.status === "corpse") throw new GameError(TEXTS.deathScreen);
    if (isEvacuated(me, ctx.now)) throw new GameError("Tu es hors jeu : impossible de scanner.");

    if (/^B\d{2}$/.test(code)) {
      const target = await playerByBadge(ctx.db, code);
      if (!target || !target.bound_at || !target.name) throw new GameError("Badge libre ou inconnu.");
      if (target.id === me.id) return { kind: "self" as const };
      const actions: ScanAction[] = [];
      if (me.status === "alive") {
        if (me.camp === "legion" && target.status === "alive" && target.camp !== "legion") {
          const reason = await killBlocker(ctx, me, target);
          actions.push({ id: "kill", label: "Tuer", enabled: !reason, reason: reason ?? undefined });
        }
        if (target.status === "corpse") {
          const reason = reportBlocker(ctx, await openCouncil(ctx.db));
          actions.push({ id: "report", label: "Signaler le corps", enabled: !reason, reason: reason ?? undefined });
        }
      }
      return { kind: "player" as const, target: { badge: target.badge_code, name: target.name }, actions };
    }

    if (/^Z-[A-Z]{3}$/.test(code)) {
      const zone = code.slice(2);
      if (!ZONE_CODES.includes(zone as never)) throw new GameError("Zone inconnue.");
      if (me.status !== "alive") throw new GameError("Les Esprits n'ont plus de zone.");
      await ctx.db.query("update players set zone = $1 where id = $2", [zone, me.id]);
      await log(ctx, "zone", { zone }, me.id);
      return { kind: "zone" as const, zone };
    }

    const mission = MISSION_BY_CODE[code];
    if (mission) {
      if (!isAct(ctx.game.phase)) throw new GameError("Les missions ne sont pas ouvertes.");
      if (mission.kind === "witness" && me.status !== "alive") throw new GameError("Cette mission est réservée aux vivants.");
      if (mission.kind === "spirit" && me.status !== "spirit") throw new GameError("Cette mission est réservée aux Esprits.");
      if (mission.zone) await ctx.db.query("update players set zone = $1 where id = $2", [mission.zone, me.id]);
      const [m] = await ctx.db.query<{ validated_at: number | null }>("select validated_at from missions where code = $1", [code]);
      const [lock] = await ctx.db.query<{ attempts: number; locked_until: number }>(
        "select attempts, locked_until from mission_locks where player_id = $1 and mission_code = $2", [me.id, code]);
      return {
        kind: "mission" as const,
        code,
        validated: m?.validated_at != null,
        lockedUntil: lock?.locked_until ?? 0,
        attemptsLeft: ctx.settings.missionAttempts - (lock?.attempts ?? 0),
        counted: me.camp !== "legion",
      };
    }

    if (/^(I|F)-[A-Z]+$/.test(code)) return { kind: "info" as const, message: "TODO_TEXTE — rien à voir ici pour l'instant (v2)." };
    throw new GameError("QR inconnu.");
  });
}

// ---------------------------------------------------------------------------------------------
// Meurtre (§4.1)

async function killBlocker(ctx: Ctx, killer: PlayerRow, victim: PlayerRow): Promise<string | null> {
  if (!isAct(ctx.game.phase) || !ctx.game.kills_open) return "Les meurtres ne sont pas encore possibles.";
  if (await openCouncil(ctx.db)) return "Un conseil est en cours.";
  if (ctx.game.conclave_cooldown_until > ctx.now) {
    const s = Math.ceil(ctx.game.conclave_cooldown_until - ctx.now);
    return `Le Conclave doit attendre ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s.`;
  }
  if (killer.status !== "alive" || killer.camp !== "legion") return "Tu ne peux pas tuer.";
  if (isEvacuated(killer, ctx.now)) return "Tu es hors jeu.";
  if (victim.status !== "alive") return "Cette personne n'est plus de ce monde.";
  if (victim.camp === "legion") return "On ne tue pas un frère de la Légion.";
  if (isEvacuated(victim, ctx.now)) return "Cette personne est hors jeu.";
  const [pending] = await ctx.db.query("select 1 from kills where victim_id = $1 and not resolved and blocked_reason is null", [victim.id]);
  if (pending) return "Cette personne est déjà condamnée.";
  return null;
}

export async function kill(database: Database, token: string, badge: string) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    const victim = await playerByBadge(ctx.db, badge);
    if (!victim || !victim.name || victim.id === me.id) throw new GameError("Cible invalide.");
    const reason = await killBlocker(ctx, me, victim);
    if (reason) throw new GameError(reason);

    // Protections (Majordome, Cercle de sel, Garde du corps) : v2. Le cooldown est consommé dans tous les cas.
    const diesAt = ctx.now + ctx.settings.deathDelay;
    await ctx.db.query(
      "insert into kills (killer_id, target_id, victim_id, scanned_at, dies_at, zone) values ($1, $2, $2, $3, $4, $5)",
      [me.id, victim.id, ctx.now, diesAt, victim.zone],
    );
    const cooldown = ctx.now + ctx.settings.conclaveCooldown;
    await ctx.db.query("update game set conclave_cooldown_until = $1 where id = 1", [cooldown]);
    await log(ctx, "kill", { killer: me.badge_code, victim: victim.badge_code, diesAt, zone: victim.zone }, me.id);
    await notifyLegion(ctx);
    return { ok: true, message: TEXTS.killDone };
  });
}

async function notifyLegion(ctx: Ctx) {
  const legion = await ctx.db.query<{ channel_key: string }>("select channel_key from players where camp = 'legion'");
  for (const p of legion) ctx.notify.players.add(p.channel_key);
}

async function resolveDeaths(ctx: Ctx) {
  if (await openCouncil(ctx.db)) return; // aucune mort ne tombe pendant un conseil
  const due = await ctx.db.query<KillRow>(
    "select * from kills where not resolved and blocked_reason is null and dies_at <= $1 order by dies_at", [ctx.now]);
  for (const k of due) {
    await ctx.db.query("update kills set resolved = true, resolved_at = $1 where id = $2", [ctx.now, k.id]);
    if (!k.victim_id) continue;
    const victim = await playerById(ctx.db, k.victim_id);
    if (victim.status !== "alive") {
      await log(ctx, "kill_void", { victim: victim.badge_code, status: victim.status });
      continue;
    }
    await ctx.db.query(
      `update players set status = 'corpse', death_cause = 'murder', died_at = $1,
         flags = flags || '{"deathZonePending": true}'::jsonb where id = $2`, [k.dies_at, victim.id]);
    await log(ctx, "death", { victim: victim.badge_code, cause: "murder", zone: victim.zone }, victim.id);
    // Veilleur, Notaire, Martyr : v2.
    ctx.notify.players.add(victim.channel_key);
    await notifyLegion(ctx);
  }
}

export async function setDeathZone(database: Database, token: string, zone: string) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    if (me.status !== "corpse") throw new GameError("Tu n'es pas un corps.");
    if (!ZONE_CODES.includes(zone as never)) throw new GameError("Zone inconnue.");
    await ctx.db.query(`update players set zone = $1, flags = flags || '{"deathZonePending": false}'::jsonb where id = $2`, [zone, me.id]);
    await ctx.db.query(
      "update kills set zone = $1 where id = (select id from kills where victim_id = $2 and resolved order by dies_at desc limit 1)",
      [zone, me.id]);
    await log(ctx, "death_zone", { zone }, me.id);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Signalement, cloche, conseil (§4.2, §4.3)

function reportBlocker(ctx: Ctx, council: CouncilRow | null): string | null {
  if (!isAct(ctx.game.phase)) return "Pas de conseil possible maintenant.";
  if (ctx.game.paused) return "La partie est en pause.";
  if (council) return "Un conseil est déjà en cours.";
  return null;
}

export async function report(database: Database, token: string, badge: string) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    if (me.status !== "alive" || isEvacuated(me, ctx.now)) throw new GameError("Tu ne peux pas signaler.");
    const corpse = await playerByBadge(ctx.db, badge);
    if (!corpse || corpse.status !== "corpse") throw new GameError("Ce n'est pas un corps.");
    const reason = reportBlocker(ctx, await openCouncil(ctx.db));
    if (reason) throw new GameError(reason);
    await startCouncil(ctx, "report", me.id);
    return { ok: true };
  });
}

export async function ringBell(database: Database, token: string) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    if (me.status !== "alive" || isEvacuated(me, ctx.now)) throw new GameError("Tu ne peux pas sonner la cloche.");
    if (me.bell_used) throw new GameError("Tu as déjà sonné la cloche.");
    const reason = reportBlocker(ctx, await openCouncil(ctx.db));
    if (reason) throw new GameError(reason);
    await ctx.db.query("update players set bell_used = true where id = $1", [me.id]);
    await startCouncil(ctx, "bell", me.id);
    return { ok: true };
  });
}

export async function startCouncil(ctx: Ctx, trigger: CouncilTrigger, callerId: string | null) {
  const corpses = await ctx.db.query<{ id: string }>("select id from players where status = 'corpse'");
  const ids = corpses.map((c) => c.id);
  // À l'ouverture d'un conseil, tous les corps passent Esprits.
  await ctx.db.query(`update players set status = 'spirit', flags = flags || '{"deathZonePending": false}'::jsonb where status = 'corpse'`);
  const debate = trigger === "accusation" ? ctx.settings.accusationDebateDuration : ctx.settings.debateDuration;
  await ctx.db.query(
    `insert into councils (trigger, caller_id, corpse_ids, stage, stage_ends_at, debate_seconds, opened_at)
     values ($1, $2, $3::jsonb, 'glas', $4, $5, $6)`,
    [trigger, callerId, JSON.stringify(ids), ctx.now + ctx.settings.glasDuration, debate, ctx.now],
  );
  await log(ctx, "council_open", { trigger, corpses: ids.length }, callerId);
  ctx.notify.everyone = ctx.notify.screen = true;
}

export async function mjConvokeCouncil(database: Database) {
  return withGame(database, async (ctx) => {
    if (!ctx.game.launched) throw new GameError("Partie non lancée.");
    if (await openCouncil(ctx.db)) throw new GameError("Un conseil est déjà en cours.");
    await startCouncil(ctx, "mj", null);
    return { ok: true };
  });
}

/** MJ : termine l'étape en cours du conseil (elle sera avancée au prochain tick). */
export async function mjSkipCouncilStage(database: Database) {
  return withGame(database, async (ctx) => {
    const c = await openCouncil(ctx.db);
    if (!c) throw new GameError("Aucun conseil en cours.");
    await ctx.db.query("update councils set stage_ends_at = $1 where id = $2", [ctx.now, c.id]);
    await runTick(ctx);
    return { ok: true };
  });
}

export async function vote(database: Database, token: string, targetBadge: string | null) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    const c = await openCouncil(ctx.db);
    if (!c || c.stage !== "vote" || c.stage_ends_at <= ctx.now) throw new GameError("Le vote n'est pas ouvert.");
    if (me.status !== "alive") throw new GameError("Seuls les vivants votent au conseil.");
    let targetId: string | null = null;
    if (targetBadge) {
      const t = await playerByBadge(ctx.db, targetBadge);
      if (!t || t.status !== "alive" || !t.name) throw new GameError("Choix invalide.");
      if (t.id === me.id) throw new GameError("On ne vote pas contre soi-même.");
      targetId = t.id;
    }
    await ctx.db.query(
      `insert into votes (council_id, voter_id, target_id, weight, at) values ($1, $2, $3, $4, $5)
       on conflict (council_id, voter_id) do update set target_id = excluded.target_id, weight = excluded.weight, at = excluded.at`,
      [c.id, me.id, targetId, voteWeight(me), ctx.now],
    );
    await log(ctx, "vote", { council: c.id, target: targetBadge }, me.id);
    ctx.notify.screen = true; // nombre de votants
    ctx.notify.players.add(me.channel_key);
    return { ok: true };
  });
}

async function advanceCouncil(ctx: Ctx) {
  const c = await openCouncil(ctx.db);
  if (!c) return;
  const s = ctx.settings;
  let { stage, stage_ends_at: endsAt } = c;
  let result = c.result;
  let changed = false;
  while (stage !== "closed" && endsAt <= ctx.now) {
    changed = true;
    switch (stage) {
      case "glas":
        stage = "debate"; endsAt += c.debate_seconds; break;
      case "debate":
        stage = "vote"; endsAt += s.voteDuration; break;
      case "vote": {
        const ballots = await ctx.db.query<{ target_id: string | null; weight: number }>(
          "select target_id, weight from votes where council_id = $1", [c.id]);
        // Marque (×2) et Invisibilité de Baal : branchés ici en v2.
        const r = tally(ballots.map((b) => ({ targetId: b.target_id, weight: b.weight })), { threshold: s.expelThreshold });
        result = r;
        await log(ctx, "council_result", { council: c.id, ...r });
        stage = "count"; endsAt += s.countDuration; break;
      }
      case "count":
        // Fenêtre du Templier (Non nobis, v2) : 30 s pendant lesquelles le résultat est annoncé.
        stage = "result"; endsAt += s.templarWindow; break;
      case "result":
        if (result?.kind === "expel" && result.targetId) {
          await expel(ctx, result.targetId);
          stage = "expulsion"; endsAt += s.expulsionDuration;
        } else {
          // Roue des châtiments : v2.
          stage = "closed";
        }
        break;
      case "expulsion":
        stage = "closed"; break;
    }
  }
  if (!changed) return;
  const closedAt = stage === "closed" ? endsAt : null;
  await ctx.db.query("update councils set stage = $1, stage_ends_at = $2, result = $3::jsonb, closed_at = $4 where id = $5", [
    stage, endsAt, result ? JSON.stringify(result) : null, closedAt, c.id,
  ]);
  if (closedAt !== null) {
    // Les morts différées qui seraient tombées pendant le conseil tombent à la clôture + 30 s.
    await ctx.db.query(
      "update kills set dies_at = $1 where not resolved and blocked_reason is null and dies_at <= $2",
      [closedAt + s.postCouncilDeathDelay, closedAt]);
    await log(ctx, "council_closed", { council: c.id });
  }
  ctx.notify.everyone = ctx.notify.screen = true;
}

async function expel(ctx: Ctx, playerId: string) {
  const p = await playerById(ctx.db, playerId);
  if (p.status !== "alive") return;
  await ctx.db.query("update players set status = 'spirit', death_cause = 'vote', died_at = $1 where id = $2", [ctx.now, p.id]);
  await log(ctx, "expelled", { badge: p.badge_code, role: p.role, camp: p.camp }, p.id);
  if (p.role === "judas" && ctx.game.act < 3) {
    addAlert(ctx, "judas_win", `Judas (${p.name}) a été expulsé avant l'acte 3 : victoire de Judas.`);
    await log(ctx, "judas_win", { badge: p.badge_code });
    await saveFlags(ctx);
  }
}

// ---------------------------------------------------------------------------------------------
// Missions (§4.6)

export async function submitMission(database: Database, token: string, code: string, answer: string) {
  return withGame(database, async (ctx) => {
    const me = await requireMe(ctx, token);
    const def = MISSION_BY_CODE[String(code).toUpperCase()];
    if (!def) throw new GameError("Mission inconnue.");
    if (!isAct(ctx.game.phase)) throw new GameError("Les missions ne sont pas ouvertes.");
    if (def.kind === "witness" && me.status !== "alive") throw new GameError("Cette mission est réservée aux vivants.");
    if (def.kind === "spirit" && me.status !== "spirit") throw new GameError("Cette mission est réservée aux Esprits.");
    if (isEvacuated(me, ctx.now)) throw new GameError("Tu es hors jeu.");
    const [m] = await ctx.db.query<{ validated_at: number | null }>("select validated_at from missions where code = $1", [def.code]);
    if (m?.validated_at != null) return { ok: true, status: "already" as const };

    const [lock] = await ctx.db.query<{ attempts: number; locked_until: number }>(
      "select attempts, locked_until from mission_locks where player_id = $1 and mission_code = $2", [me.id, def.code]);
    if (me.camp !== "legion" && lock && lock.locked_until > ctx.now) {
      throw new GameError(`Mission verrouillée encore ${Math.ceil(lock.locked_until - ctx.now)} s.`);
    }

    const correct = normalizeAnswer(String(answer ?? "")) === normalizeAnswer(def.answer);
    const counted = correct && me.camp !== "legion";
    await ctx.db.query("insert into mission_scans (mission_code, player_id, answer, correct, counted, at) values ($1, $2, $3, $4, $5, $6)", [
      def.code, me.id, String(answer ?? "").slice(0, 100), correct, counted, ctx.now,
    ]);

    if (me.camp === "legion") {
      // Enregistré (visible par le Domestique en v2), ne compte jamais.
      await log(ctx, "mission_legion", { code: def.code, correct }, me.id);
      return { ok: true, status: "not_counted" as const, correct };
    }

    if (correct) {
      await ctx.db.query("update missions set validated_by = $1, validated_at = $2 where code = $3", [me.id, ctx.now, def.code]);
      await log(ctx, "mission_validated", { code: def.code }, me.id);
      await updateProgress(ctx);
      ctx.notify.everyone = ctx.notify.screen = true;
      return { ok: true, status: "validated" as const };
    }

    const attempts = (lock?.attempts ?? 0) + 1;
    const locked = attempts >= ctx.settings.missionAttempts;
    await ctx.db.query(
      `insert into mission_locks (player_id, mission_code, attempts, locked_until) values ($1, $2, $3, $4)
       on conflict (player_id, mission_code) do update set attempts = excluded.attempts, locked_until = excluded.locked_until`,
      [me.id, def.code, locked ? 0 : attempts, locked ? ctx.now + ctx.settings.missionLock : 0],
    );
    await log(ctx, "mission_wrong", { code: def.code, attempts, locked }, me.id);
    return {
      ok: false,
      status: locked ? ("locked" as const) : ("wrong" as const),
      attemptsLeft: locked ? 0 : ctx.settings.missionAttempts - attempts,
      lockedUntil: locked ? ctx.now + ctx.settings.missionLock : 0,
    };
  });
}

export async function computeProgress(db: Db): Promise<number> {
  const [r] = await db.query<{ w: number; s: number }>(
    `select count(*) filter (where kind = 'witness' and validated_at is not null)::int as w,
            count(*) filter (where kind = 'spirit' and validated_at is not null)::int as s from missions`);
  return Math.min(1, (r.w + 0.5 * r.s) / 24);
}

async function updateProgress(ctx: Ctx) {
  const progress = await computeProgress(ctx.db);
  await ctx.db.query("update game set mission_progress = $1 where id = 1", [progress]);
  const reached = new Set(ctx.game.flags.thresholds ?? []);
  for (const t of [0.33, 0.66, 1]) {
    if (progress >= t && !reached.has(t)) {
      reached.add(t);
      // Effets des seuils (indice bonus, image caméra, Révélation) : v2.
      await log(ctx, "mission_threshold", { threshold: t });
    }
  }
  ctx.game.flags.thresholds = [...reached];
  await saveFlags(ctx);
}

// ---------------------------------------------------------------------------------------------
// MJ : actions manuelles

export async function mjKill(database: Database, playerId: string) {
  return withGame(database, async (ctx) => {
    const p = await playerById(ctx.db, playerId);
    if (p.status !== "alive") throw new GameError("Déjà mort.");
    await ctx.db.query(`update players set status = 'corpse', death_cause = 'mj', died_at = $1,
      flags = flags || '{"deathZonePending": true}'::jsonb where id = $2`, [ctx.now, p.id]);
    await ctx.db.query("update kills set resolved = true, resolved_at = $1 where victim_id = $2 and not resolved", [ctx.now, p.id]);
    await log(ctx, "mj_kill", { badge: p.badge_code });
    ctx.notify.players.add(p.channel_key);
    await checkVictory(ctx);
    return { ok: true };
  });
}

export async function mjRevive(database: Database, playerId: string) {
  return withGame(database, async (ctx) => {
    const p = await playerById(ctx.db, playerId);
    if (p.status === "alive") throw new GameError("Déjà vivant.");
    await ctx.db.query(`update players set status = 'alive', death_cause = null, died_at = null,
      flags = flags || '{"deathZonePending": false}'::jsonb where id = $1`, [p.id]);
    await log(ctx, "mj_revive", { badge: p.badge_code });
    ctx.notify.players.add(p.channel_key);
    ctx.notify.screen = true;
    return { ok: true };
  });
}

export async function mjEvent(database: Database, eventId: string, op: "shift" | "now" | "cancel", seconds = 0) {
  return withGame(database, async (ctx) => {
    const [e] = await ctx.db.query<EventRow>("select * from scheduled_events where id = $1", [eventId]);
    if (!e) throw new GameError("Événement introuvable", 404);
    if (e.status !== "pending") throw new GameError("Événement déjà traité.");
    if (op === "shift") await ctx.db.query("update scheduled_events set at = greatest(0, at + $1) where id = $2", [seconds, e.id]);
    if (op === "now") await ctx.db.query("update scheduled_events set at = $1 where id = $2", [ctx.now, e.id]);
    if (op === "cancel") await ctx.db.query("update scheduled_events set status = 'cancelled', done_at = $1 where id = $2", [ctx.now, e.id]);
    await log(ctx, "mj_event", { event: e.label, op, seconds });
    if (op === "now") await runTick(ctx);
    return { ok: true };
  });
}

export async function mjScreen(database: Database, forced: { mode: string; text?: string } | null) {
  return withGame(database, async (ctx) => {
    await ctx.db.query("update game set screen_state = $1::jsonb where id = 1", [JSON.stringify(forced ? { forced } : {})]);
    await log(ctx, "mj_screen", { forced });
    ctx.notify.screen = true;
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Tick (§1) : appelé chaque seconde par le panneau MJ. Idempotent (verrou + logique sur l'état).

export async function tick(database: Database) {
  return withGame(database, async (ctx) => {
    await runTick(ctx);
    // Un tick sans effet (le cas de presque toutes les secondes) ne diffuse rien, pas même au MJ.
    ctx.notify.mj = ctx.notify.screen || ctx.notify.everyone || ctx.notify.players.size > 0;
    return { ok: true, now: ctx.now, phase: ctx.game.phase };
  });
}

async function runTick(ctx: Ctx) {
  await ctx.db.query("update game set last_tick_at = now() where id = 1");
  if (!ctx.game.launched || ctx.game.paused) return;
  await processEvents(ctx);
  await advanceCouncil(ctx);
  await resolveDeaths(ctx);
  await checkVictory(ctx);
}

async function processEvents(ctx: Ctx) {
  const due = await ctx.db.query<EventRow>("select * from scheduled_events where status = 'pending' and at <= $1 order by at", [ctx.now]);
  for (const e of due) {
    let status: "done" | "skipped" | "pending" = "done";
    let note: string | null = null;
    switch (e.kind) {
      case "phase": {
        const phase = e.payload.phase as Phase;
        const act = PHASE_ACT[phase];
        await ctx.db.query("update game set phase = $1, act = $2, updated_at = now() where id = 1", [phase, act]);
        ctx.game.phase = phase;
        ctx.game.act = act;
        await log(ctx, "phase", { phase, act });
        ctx.notify.everyone = ctx.notify.screen = true;
        break;
      }
      case "kills_open":
        await ctx.db.query("update game set kills_open = true where id = 1");
        ctx.game.kills_open = true;
        await log(ctx, "kills_open");
        await notifyLegion(ctx);
        break;
      case "council": {
        const variant = e.payload.variant === "accusation" ? "accusation" : "office";
        if (await openCouncil(ctx.db)) {
          if (variant === "accusation") { status = "pending"; break; } // reporté à la fin du conseil en cours
          status = "skipped"; note = "conseil en cours";
          break;
        }
        if (variant === "office") {
          const [recent] = await ctx.db.query("select 1 from councils where closed_at >= $1", [e.at - ctx.settings.officeSkipWindow]);
          if (recent) { status = "skipped"; note = "conseil dans les 10 dernières minutes"; break; }
        }
        await startCouncil(ctx, variant, null);
        break;
      }
      default:
        note = "non implémenté en v1";
        await log(ctx, "event_v2", { kind: e.kind, label: e.label });
    }
    if (status !== "pending") {
      await ctx.db.query("update scheduled_events set status = $1, done_at = $2, note = $3 where id = $4", [status, ctx.now, note, e.id]);
      if (status === "skipped") await log(ctx, "event_skipped", { label: e.label, note });
    }
  }
}

/**
 * Victoires immédiates (§4.10). Elles n'arrêtent jamais la partie : le MJ reçoit une alerte et choisit
 * « Continuer » ou « Passer au verdict » (mjDecideAlert).
 * Parité : agents vivants ≥ non-Légion vivants (Témoins + Neutres, évacués et exilés inclus).
 */
async function checkVictory(ctx: Ctx) {
  if (!ctx.game.launched || !isAct(ctx.game.phase)) return;
  const [r] = await ctx.db.query<{ legion: number; others: number }>(
    `select count(*) filter (where camp = 'legion' and status = 'alive')::int as legion,
            count(*) filter (where camp <> 'legion' and status = 'alive')::int as others
       from players where role is not null`);
  let changed = false;
  if (r.legion === 0) changed = addAlert(ctx, "witness_win", "Tous les agents de la Légion sont éliminés : victoire immédiate des Témoins.") || changed;
  if (r.legion > 0 && r.legion >= r.others) changed = addAlert(ctx, "legion_win", `Agents vivants (${r.legion}) ≥ non-Légion vivants (${r.others}) : victoire immédiate de la Légion.`) || changed;
  if (changed) {
    await saveFlags(ctx);
    await log(ctx, "victory_alert", { legion: r.legion, others: r.others });
  }
}

export const VICTORY_ALERTS = ["legion_win", "witness_win"];

/** MJ : réponse à une alerte. « verdict » n'est possible que pour une victoire immédiate. */
export async function mjDecideAlert(database: Database, kind: string, decision: "continue" | "verdict") {
  return withGame(database, async (ctx) => {
    const alert = (ctx.game.flags.alerts ?? []).find((a) => a.kind === kind);
    if (!alert) throw new GameError("Alerte introuvable", 404);
    if (alert.decision) throw new GameError("Alerte déjà traitée.");
    if (decision === "verdict" && !VICTORY_ALERTS.includes(kind)) throw new GameError("Cette alerte ne permet pas de passer au verdict.");
    alert.decision = decision;
    alert.decidedAt = ctx.now;
    await saveFlags(ctx);
    await log(ctx, "mj_alert_decision", { kind, decision });
    if (decision === "verdict") await jumpToVerdict(ctx);
    return { ok: true };
  });
}

/**
 * Saut direct à la phase verdict : le conseil éventuel est clos, les événements restants sont annulés,
 * sauf la finale, replanifiée avec le même écart qu'initialement après le verdict.
 */
async function jumpToVerdict(ctx: Ctx) {
  if (ctx.game.phase === "verdict" || ctx.game.phase === "finale") throw new GameError("Le verdict a déjà commencé.");
  const council = await openCouncil(ctx.db);
  if (council) {
    await ctx.db.query("update councils set stage = 'closed', stage_ends_at = $1, closed_at = $1 where id = $2", [ctx.now, council.id]);
    await log(ctx, "council_closed", { council: council.id, reason: "verdict" });
  }
  const pending = await ctx.db.query<EventRow>("select * from scheduled_events where status = 'pending'");
  const verdict = pending.find((e) => e.kind === "phase" && e.payload.phase === "verdict");
  const finale = pending.find((e) => e.kind === "phase" && e.payload.phase === "finale");
  const gap = verdict && finale ? Math.max(0, finale.at - verdict.at) : 10 * 60;
  for (const e of pending) {
    if (e === verdict || e === finale) continue;
    await ctx.db.query("update scheduled_events set status = 'cancelled', done_at = $1, note = 'passage au verdict' where id = $2", [ctx.now, e.id]);
  }
  if (verdict) await ctx.db.query("update scheduled_events set at = $1 where id = $2", [ctx.now, verdict.id]);
  else await ctx.db.query("insert into scheduled_events (kind, label, at, payload) values ('phase', 'Verdict', $1, '{\"phase\":\"verdict\"}'::jsonb)", [ctx.now]);
  if (finale) await ctx.db.query("update scheduled_events set at = $1 where id = $2", [ctx.now + gap, finale.id]);
  else await ctx.db.query("insert into scheduled_events (kind, label, at, payload) values ('phase', 'Finale', $1, '{\"phase\":\"finale\"}'::jsonb)", [ctx.now + gap]);
  await log(ctx, "jump_to_verdict", { finaleAt: ctx.now + gap });
  ctx.notify.everyone = ctx.notify.screen = true;
  await runTick(ctx);
}
