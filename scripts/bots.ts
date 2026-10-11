// Simulation d'une partie complète par des bots, contre un serveur qui tourne (npm run dev / start).
//
//   ALLOW_TIME_WARP=1 doit être actif côté serveur : le script avance l'horloge de jeu par pas
//   (BOT_STEP secondes, 5 par défaut) au lieu d'attendre 2 h 40 réelles.
//
//   npm run bots                        → 30 joueurs sur http://localhost:3000
//   BOT_PLAYERS=24 npm run bots         → 24 joueurs (4 agents)
//   BOT_BASE_URL=https://… npm run bots → contre un déploiement (avec ALLOW_TIME_WARP=1 !)
//   BOT_ON_VICTORY=verdict npm run bots → le MJ choisit « Passer au verdict » à la 1re victoire immédiate
//
// Les bots n'agissent QUE par les routes joueur (/q, /api/me/*), comme de vrais téléphones.
// Le script lit l'état MJ comme « oracle » pour décider (qui est mort, qui est de la Légion…)
// et vérifie à chaque étape qu'aucune vue joueur ou écran ne trahit un rôle.
import { config } from "dotenv";
import { ROLES } from "../content/roles";
import { MISSIONS } from "../content/missions";

config({ path: ".env.local" });
config();

const BASE = (process.env.BOT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const N = Number(process.env.BOT_PLAYERS ?? 30);
const STEP = Number(process.env.BOT_STEP ?? 5);
const SEED = Number(process.env.BOT_SEED ?? Date.now() % 100000);
const PASSWORD = process.env.MJ_PASSWORD ?? "";
/** Décision du MJ face à une victoire immédiate : « continue » (défaut) ou « verdict ». */
const ON_VICTORY = process.env.BOT_ON_VICTORY === "verdict" ? "verdict" : "continue";

// PRNG déterministe (mulberry32) pour rejouer une partie avec BOT_SEED.
let seed = SEED;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
const chance = (p: number) => rand() < p;

// ---------------------------------------------------------------------------------------------

class HttpError extends Error {}
const stats = { requests: 0, gameErrors: 0, kills: 0, reports: 0, bells: 0, votes: 0, missionsOk: 0, missionsWrong: 0, councils: 0, expulsions: [] as string[] };

async function http(method: string, path: string, cookie?: string, body?: unknown, okStatuses = [200]) {
  stats.requests++;
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status >= 500) throw new HttpError(`${method} ${path} → ${res.status} ${text}`);
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* redirections */ }
  return { status: res.status, json, res, ok: okStatuses.includes(res.status) };
}

interface Bot { badge: string; name: string; cookie: string }
interface MjPlayer { id: string; badge: string; name: string | null; role: string | null; camp: string | null; status: string; zone: string | null }
interface MjState {
  clock: { now: number; phase: string; launched: boolean };
  killsOpen: boolean;
  cooldownUntil: number;
  gauge: number;
  alerts: { kind: string; text: string; decision?: string }[];
  players: MjPlayer[];
  council: null | { id: string; stage: string; trigger: string; result: { kind: string; targetId: string | null } | null };
  events: { label: string; status: string; at: number }[];
  missions: { code: string; validated_at: number | null }[];
  kills: { victim: string; resolved: boolean }[];
}

let mjCookie = "";
const mj = async (op: string, body: unknown = {}) => {
  const r = await http("POST", `/api/mj/${op}`, mjCookie, body);
  if (r.status !== 200) throw new Error(`MJ ${op} : ${JSON.stringify(r.json)}`);
  return r.json;
};
const mjState = async () => (await http("GET", "/api/mj", mjCookie)).json as unknown as MjState;

/** Action joueur : une erreur de jeu (4xx) est tolérée et comptée, une 5xx fait échouer le script. */
async function act(bot: Bot, op: string, body: unknown = {}) {
  const r = await http("POST", `/api/me/${op}`, bot.cookie, body);
  if (r.status !== 200) stats.gameErrors++;
  return r;
}

const ROLE_IDS = ROLES.map((r) => r.id);
const ROLE_NAMES = new Map(ROLES.map((r) => [r.id, r.name]));

function assertNoLeak(where: string, json: unknown, viewer: MjPlayer | null, players: MjPlayer[]) {
  const text = JSON.stringify(json);
  for (const other of players) {
    if (!other.role || other.id === viewer?.id) continue;
    if (viewer?.camp === "legion" && other.camp === "legion") continue;
    if (viewer?.role === "frere" && other.role === "templier") continue;
    if (viewer?.role === other.role) continue;
    if (text.includes(`"${other.role}"`) || text.includes(ROLE_NAMES.get(other.role as never)!)) {
      throw new Error(`FUITE : ${where} contient le rôle ${other.role} de ${other.name}`);
    }
  }
  if (!viewer) for (const id of ROLE_IDS) if (text.includes(`"${id}"`)) throw new Error(`FUITE : ${where} contient "${id}"`);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  console.log(`Bots : ${N} joueurs sur ${BASE}, pas de ${STEP} s, graine ${SEED}`);
  if (!PASSWORD) throw new Error("MJ_PASSWORD manquant (.env.local)");

  const login = await http("POST", "/api/mj/login", undefined, { password: PASSWORD });
  if (login.status !== 200) throw new Error(`Connexion MJ refusée : ${JSON.stringify(login.json)}`);
  mjCookie = login.res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  await mj("reset", { keepPlayers: false });

  // 1. Lobby : chaque bot scanne son badge (sans cookie) puis saisit son prénom.
  const bots: Bot[] = [];
  for (let i = 1; i <= N; i++) {
    const badge = `B${String(i).padStart(2, "0")}`;
    const r = await http("GET", `/q/${badge}`, undefined, undefined, [303, 307]);
    const cookie = r.res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!cookie.startsWith("l66_token=")) throw new Error(`Pas de cookie pour ${badge}`);
    const bot = { badge, name: `Bot${String(i).padStart(2, "0")}`, cookie };
    const named = await act(bot, "name", { name: bot.name });
    if (named.status !== 200) throw new Error(`Prénom ${badge} : ${JSON.stringify(named.json)}`);
    bots.push(bot);
  }
  // Re-scan d'un badge déjà lié par un autre téléphone → refus.
  const stolen = await http("GET", "/q/B01", undefined, undefined, [303]);
  if (!String(stolen.res.headers.get("location")).includes("badge_taken")) throw new Error("Un badge lié a pu être re-lié");
  // Scan d'un badge d'un autre joueur avec cookie → menu d'actions.
  const other = await http("GET", "/q/B02", bots[0].cookie, undefined, [303]);
  if (!String(other.res.headers.get("location")).includes("/play?scan=B02")) throw new Error("Redirection /q incorrecte");

  // 2. Rôles.
  await mj("assign-roles");
  let s = await mjState();
  const byBadge = (b: string) => s.players.find((p) => p.badge === b)!;
  const botOf = (p: MjPlayer) => bots.find((b) => b.badge === p.badge)!;
  const legionCount = s.players.filter((p) => p.camp === "legion").length;
  console.log(`Rôles attribués : ${s.players.filter((p) => p.role).length} joueurs, ${legionCount} agents.`);
  for (const b of bots) {
    const v = await http("GET", "/api/me", b.cookie);
    assertNoLeak(`/api/me ${b.badge}`, v.json, byBadge(b.badge), s.players);
  }

  // 3. Lancement et boucle de jeu.
  await mj("launch");
  const voted = new Set<string>();
  const corpseSeenAt = new Map<string, number>();
  const zoneSet = new Set<string>();
  let lastCouncil: string | null = null;
  let suspect: MjPlayer | null = null;
  let lastPhase = "";
  const phasesSeen: string[] = [];
  const t0 = Date.now();

  for (let step = 0; ; step++) {
    const w = await http("POST", "/api/mj/warp", mjCookie, { seconds: STEP });
    if (w.status !== 200) throw new Error(`warp refusé (${JSON.stringify(w.json)}) : lance le serveur avec ALLOW_TIME_WARP=1`);
    await http("POST", "/api/tick", mjCookie); // double appel volontaire : le tick doit être idempotent
    s = await mjState();
    const now = s.clock.now;
    if (s.clock.phase !== lastPhase) {
      lastPhase = s.clock.phase;
      phasesSeen.push(`${lastPhase}@T+${Math.round(now / 60)}min`);
    }
    if (s.clock.phase === "finale") break;
    if (step > 100000) throw new Error("Boucle infinie ?");

    // Alertes MJ : tant qu'aucune décision n'est prise, l'écran ne doit rien annoncer.
    for (const a of s.alerts.filter((x) => !x.decision)) {
      const screen = JSON.stringify((await http("GET", "/api/screen")).json);
      if (/victoire|_win/i.test(screen)) throw new Error(`L'écran annonce une victoire avant la décision du MJ : ${screen}`);
      const decision = ["legion_win", "witness_win"].includes(a.kind) ? ON_VICTORY : "continue";
      await mj("alert", { kind: a.kind, decision });
      console.log(`  T+${fmt(now)} alerte MJ « ${a.text} » → ${decision === "verdict" ? "Passer au verdict" : "Continuer"}`);
    }
    if (s.alerts.some((x) => !x.decision)) continue; // l'état a changé : on relit au pas suivant

    const players = s.players.filter((p) => p.role);
    const alive = players.filter((p) => p.status === "alive");
    const council = s.council;
    const actPhase = ["act1", "act2", "act3"].includes(s.clock.phase);

    // Écran : jamais de rôle.
    if (step % 6 === 0) assertNoLeak("/api/screen", (await http("GET", "/api/screen")).json, null, players);
    // Vues joueurs : contrôle tournant.
    if (step % 3 === 0) {
      const p = pick(players);
      assertNoLeak(`/api/me ${p.badge}`, (await http("GET", "/api/me", botOf(p).cookie)).json, p, players);
    }

    // Conseil
    if (council) {
      if (council.id !== lastCouncil) {
        lastCouncil = council.id;
        stats.councils++;
        voted.clear();
        // Chaque conseil, la salle se forme un soupçon (un agent 60 % du temps).
        const legionNow = alive.filter((p) => p.camp === "legion");
        suspect = legionNow.length && chance(0.6) ? pick(legionNow) : pick(alive);
        console.log(`  T+${fmt(now)} conseil (${council.trigger})`);
      }
      if (council.stage === "vote") {
        const legionAlive = alive.filter((p) => p.camp === "legion");
        for (const p of alive) {
          if (voted.has(p.id)) continue;
          voted.add(p.id);
          const others = alive.filter((o) => o.id !== p.id);
          let target: MjPlayer | null;
          if (p.camp === "legion") target = chance(0.3) ? null : pick(others.filter((o) => o.camp !== "legion"));
          else if (suspect && suspect.id !== p.id && suspect.status === "alive" && chance(0.55)) target = suspect;
          else if (legionAlive.length && chance(0.2)) target = pick(legionAlive) ?? null;
          else target = chance(0.15) ? null : pick(others);
          const r = await act(botOf(p), "vote", { badge: target?.badge ?? null });
          if (r.status === 200) stats.votes++;
          // Quelques changements d'avis.
          if (chance(0.1) && others.length) await act(botOf(p), "vote", { badge: pick(others).badge });
        }
      }
      if (council.stage === "expulsion" && council.result?.targetId) {
        const t = players.find((p) => p.id === council.result!.targetId);
        const label = `${t?.name} (${t?.camp})`;
        if (!stats.expulsions.includes(label)) {
          stats.expulsions.push(label);
          console.log(`  T+${fmt(now)} expulsion : ${label}`);
        }
      }
      continue; // pas d'autre action pendant un conseil
    }
    if (!actPhase) continue;

    // Morts : la victime indique sa zone, puis un vivant trouve le corps après un délai.
    for (const c of players.filter((p) => p.status === "corpse")) {
      if (!zoneSet.has(c.id)) {
        zoneSet.add(c.id);
        await act(botOf(c), "death-zone", { zone: pick(["BIB", "CHA", "SER", "PON", "ARC", "SAL"]) });
      }
      if (!corpseSeenAt.has(c.id)) corpseSeenAt.set(c.id, now);
      if (now - corpseSeenAt.get(c.id)! > 20 + rand() * 120 && alive.length) {
        const finder = pick(alive);
        const sc = await act(botOf(finder), "scan", { code: c.badge });
        const actions = (sc.json.actions as { id: string; enabled: boolean }[] | undefined) ?? [];
        if (actions.some((a) => a.id === "report" && a.enabled)) {
          const r = await act(botOf(finder), "report", { badge: c.badge });
          if (r.status === 200) { stats.reports++; console.log(`  T+${fmt(now)} ${finder.name} signale ${c.name}`); }
          break;
        }
      }
    }

    // Meurtre : quand le Conclave est prêt, un agent vivant frappe (pas tout de suite).
    const killers = alive.filter((p) => p.camp === "legion");
    if (s.killsOpen && s.cooldownUntil <= now && killers.length && chance(0.25)) {
      const victims = alive.filter((p) => p.camp !== "legion");
      if (victims.length) {
        const killer = pick(killers);
        const victim = pick(victims);
        // Le tueur passe d'abord par une zone (scan Z-) comme sur le terrain.
        await act(botOf(victim), "scan", { code: `Z-${pick(["BIB", "CHA", "SER", "PON", "ARC", "SAL"])}` });
        const sc = await act(botOf(killer), "scan", { code: victim.badge });
        const kill = ((sc.json.actions as { id: string; enabled: boolean }[] | undefined) ?? []).find((a) => a.id === "kill");
        if (!kill?.enabled) throw new Error(`Action « tuer » indisponible alors que le Conclave est prêt : ${JSON.stringify(sc.json)}`);
        const r = await act(botOf(killer), "kill", { badge: victim.badge });
        if (r.status !== 200) throw new Error(`Meurtre refusé : ${JSON.stringify(r.json)}`);
        stats.kills++;
        console.log(`  T+${fmt(now)} ${killer.name} (${killer.role}) tue ${victim.name}`);
      }
    }

    // Cloche d'urgence : rare.
    if (chance(0.004) && alive.length) {
      const ringer = pick(alive);
      const r = await act(botOf(ringer), "bell");
      if (r.status === 200) { stats.bells++; console.log(`  T+${fmt(now)} ${ringer.name} sonne la cloche`); }
    }

    // Missions : vivants (témoins + neutres comptent, Légion enregistrée sans compter) ; Esprits : E1–E4.
    if (chance(0.12)) {
      const open = s.missions.filter((m) => m.validated_at == null);
      const p = pick(players.filter((x) => x.status === "alive" || x.status === "spirit"));
      const pool = open.filter((m) => (p.status === "spirit" ? m.code.startsWith("E") : m.code.startsWith("M-")));
      if (pool.length) {
        const m = pick(pool);
        await act(botOf(p), "scan", { code: m.code });
        const answer = chance(0.3) ? "mauvaise réponse" : MISSIONS.find((x) => x.code === m.code)!.answer;
        const r = await act(botOf(p), "mission", { code: m.code, answer });
        if (r.json.status === "validated") stats.missionsOk++;
        else if (r.json.status === "wrong" || r.json.status === "locked") stats.missionsWrong++;
      }
    }
  }

  // 4. Bilan et vérifications finales.
  s = await mjState();
  const players = s.players.filter((p) => p.role);
  const pending = s.events.filter((e) => e.status === "pending");
  if (pending.length) throw new Error(`Événements non traités : ${pending.map((e) => e.label).join(", ")}`);
  if (s.kills.some((k) => !k.resolved)) throw new Error("Meurtre non résolu en fin de partie");
  if (stats.kills === 0 || stats.councils === 0 || stats.votes === 0) throw new Error("La partie n'a pas exercé meurtre / conseil / vote");
  if (stats.reports === 0) throw new Error("Aucun signalement pendant la partie");

  const count = (st: string) => players.filter((p) => p.status === st).length;
  console.log("\n=== Fin de partie ===");
  console.log(`Phases : ${phasesSeen.join(" → ")}`);
  console.log(`Meurtres ${stats.kills} · signalements ${stats.reports} · cloches ${stats.bells} · conseils ${stats.councils} · votes ${stats.votes}`);
  console.log(`Expulsions : ${stats.expulsions.join(", ") || "aucune"}`);
  console.log(`Missions : ${stats.missionsOk} validées, ${stats.missionsWrong} ratées · jauge ${Math.round(s.gauge * 100)} %`);
  console.log(`Statuts : ${count("alive")} vivants, ${count("corpse")} corps, ${count("spirit")} Esprits`);
  console.log(`Événements : ${s.events.map((e) => `${e.label}=${e.status}`).join(" · ")}`);
  console.log(`Alertes MJ : ${s.alerts.map((a) => `${a.text} [${a.decision}]`).join(" | ") || "aucune"}`);
  console.log(`Requêtes ${stats.requests} (dont ${stats.gameErrors} refus de jeu 4xx attendus), durée ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log("OK : partie simulée de bout en bout sans erreur.");
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

main().catch((e) => {
  console.error("\nÉCHEC :", e instanceof Error ? e.message : e);
  process.exit(1);
});
