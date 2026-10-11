// Vues filtrées : c'est le SEUL chemin par lequel les clients reçoivent des données.
// Règle d'or : aucune vue ne contient le rôle ou le camp d'un autre joueur,
// sauf ce qu'un pouvoir révèle (ici : les alliés de la Légion, le Templier pour le Frère).
import { CAMP_LABELS, ROLE_BY_ID } from "@/content/roles";
import { MISSIONS, MISSION_BY_CODE } from "@/content/missions";
import { SCREEN_QUESTIONS, TEXTS } from "@/content/texts";
import { ZONES } from "@/content/zones";
import type { Db } from "@/lib/db";
import { gameNow } from "./clock";
import { computeProgress, openCouncil, playerByToken } from "./engine";
import { GameError } from "./errors";
import { mergeSettings } from "./settings";
import type { CouncilRow, EventRow, GameRow, KillRow, PlayerRow } from "./types";

async function loadGame(db: Db): Promise<GameRow> {
  const [g] = await db.query<GameRow>("select * from game where id = 1");
  if (!g) throw new GameError("Partie non initialisée", 503);
  return g;
}

function clockInfo(g: GameRow) {
  return { now: gameNow(g), paused: g.paused, launched: g.launched, phase: g.phase, act: g.act };
}

function glasLine(c: CouncilRow, caller: PlayerRow | undefined) {
  switch (c.trigger) {
    case "report": return TEXTS.glasReport(caller?.name ?? "?");
    case "bell": return TEXTS.glasBell(caller?.name ?? "?");
    case "accusation": return TEXTS.glasAccusation;
    case "mj": return TEXTS.glasMj;
    default: return TEXTS.glasOffice;
  }
}

/** Résultat d'un conseil sous forme publique (noms, voix affichées), sans aucun rôle. */
function publicResult(c: CouncilRow, players: PlayerRow[]) {
  if (!c.result) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const target = c.result.targetId ? byId.get(c.result.targetId) : undefined;
  return {
    bars: Object.entries(c.result.totals)
      .map(([id, votes]) => ({ name: byId.get(id)?.name ?? "?", votes }))
      .sort((a, b) => b.votes - a.votes),
    none: c.result.none,
    total: c.result.total,
    kind: c.result.kind,
    targetName: target?.name ?? null,
    share: c.result.share,
    text:
      c.result.kind === "expel" ? null
      : c.result.kind === "wheel" && target?.name ? TEXTS.wheelPlaceholder(target.name)
      : TEXTS.noExpulsion,
  };
}

// ---------------------------------------------------------------------------------------------

export async function playerView(db: Db, token: string | undefined) {
  const me = await playerByToken(db, token);
  if (!me) return null;
  const g = await loadGame(db);
  const settings = mergeSettings(g.settings);
  const base = {
    clock: clockInfo(g),
    channel: `player:${me.channel_key}`,
    me: {
      badge: me.badge_code,
      name: me.name,
      status: me.status,
      zone: me.zone,
      bellUsed: me.bell_used,
      deathCause: me.death_cause,
      deathZonePending: !!me.flags?.deathZonePending,
    },
    zones: ZONES,
  };
  if (!me.role) return { ...base, role: null, lobbyText: TEXTS.lobbyWait };

  const def = ROLE_BY_ID[me.role];
  const role = {
    id: def.id,
    name: def.name,
    camp: def.camp,
    campLabel: CAMP_LABELS[def.camp],
    objective: def.objective,
    description: def.description,
    powers: def.powers,
    metals: me.metals,
  };

  let legion = null;
  if (me.camp === "legion") {
    const allies = await db.query<PlayerRow>("select * from players where camp = 'legion' and id <> $1 order by name", [me.id]);
    legion = {
      allies: allies.map((a) => ({ name: a.name, roleName: a.role ? ROLE_BY_ID[a.role].name : "?", status: a.status })),
      cooldownUntil: g.conclave_cooldown_until,
      killsOpen: g.kills_open,
    };
  }

  let known: { label: string; name: string }[] = [];
  if (me.role === "frere") {
    const t = await db.query<PlayerRow>("select * from players where role = 'templier'");
    known = t.map((p) => ({ label: "Le Templier", name: p.name ?? "?" }));
  }

  const council = await openCouncil(db);
  let councilView = null;
  if (council) {
    const candidates = await db.query<PlayerRow>("select * from players where status = 'alive' and role is not null and id <> $1 order by name", [me.id]);
    const [myVote] = await db.query<{ target_id: string | null; badge_code: string | null }>(
      "select v.target_id, p.badge_code from votes v left join players p on p.id = v.target_id where v.council_id = $1 and v.voter_id = $2",
      [council.id, me.id]);
    councilView = {
      stage: council.stage,
      endsAt: council.stage_ends_at,
      canVote: council.stage === "vote" && me.status === "alive",
      candidates: candidates.map((c) => ({ badge: c.badge_code, name: c.name })),
      myVote: myVote ? { badge: myVote.badge_code } : null,
    };
  }

  const missionRows = await db.query<{ code: string; validated_at: number | null }>("select code, validated_at from missions order by code");
  const locks = await db.query<{ mission_code: string; attempts: number; locked_until: number }>(
    "select * from mission_locks where player_id = $1", [me.id]);
  const lockBy = new Map(locks.map((l) => [l.mission_code, l]));
  const wantKind = me.status === "spirit" ? "spirit" : "witness";
  const missions = missionRows
    .filter((m) => MISSION_BY_CODE[m.code]?.kind === wantKind)
    .map((m) => {
      const d = MISSION_BY_CODE[m.code];
      const l = lockBy.get(m.code);
      return {
        code: m.code, zone: d.zone, title: d.title, statement: d.statement,
        validated: m.validated_at != null,
        lockedUntil: l?.locked_until ?? 0,
        attemptsLeft: settings.missionAttempts - (l?.attempts ?? 0),
      };
    });

  return {
    ...base,
    role,
    legion,
    known,
    council: councilView,
    missions,
    gauge: g.mission_progress,
    texts: { death: TEXTS.deathScreen, deathZone: TEXTS.deathZonePrompt, spirit: TEXTS.spiritScreen },
  };
}

export type PlayerView = NonNullable<Awaited<ReturnType<typeof playerView>>>;

// ---------------------------------------------------------------------------------------------

export async function screenView(db: Db) {
  const g = await loadGame(db);
  const settings = mergeSettings(g.settings);
  const players = await db.query<PlayerRow>("select * from players where role is not null");
  const fragments = await db.query<{ code: string; state: string }>("select code, state from fragments order by code");
  // Les corps non découverts comptent encore parmi les vivants : l'écran ne doit pas trahir un meurtre.
  const alive = players.filter((p) => p.status === "alive" || p.status === "corpse").length;
  const spirits = players.filter((p) => p.status === "spirit" || p.status === "expelled").length;

  const banner = {
    questions: SCREEN_QUESTIONS,
    nightDuration: settings.nightDuration,
    gauge: g.mission_progress,
    alive,
    spirits,
    fragments,
    act: g.act,
    phase: g.phase,
  };

  let mode: string = "veille";
  let payload: Record<string, unknown> = { text: g.phase === "intro" ? TEXTS.intro : TEXTS.veille };
  const council = await openCouncil(db);
  if (council) {
    const byId = new Map(players.map((p) => [p.id, p]));
    const caller = council.caller_id ? byId.get(council.caller_id) : undefined;
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from votes where council_id = $1", [council.id]);
    const corpses = council.corpse_ids.map((id) => byId.get(id)?.name ?? "?");
    const common = {
      stage: council.stage,
      endsAt: council.stage_ends_at,
      trigger: council.trigger,
      line: glasLine(council, caller),
      corpses,
      voters: n,
      electorate: players.filter((p) => p.status === "alive").length,
    };
    if (council.stage === "glas") {
      mode = "glas";
      payload = common;
    } else if (council.stage === "expulsion" && council.result?.targetId) {
      mode = "expulsion";
      const t = byId.get(council.result.targetId);
      const name = t?.name ?? "?";
      payload = { ...common, name, text: t?.camp === "legion" ? TEXTS.expelledLegion(name) : TEXTS.expelledOther(name) };
    } else {
      mode = "conseil";
      payload = { ...common, result: council.stage === "count" || council.stage === "result" ? publicResult(council, players) : null };
    }
  }
  const forced = g.screen_state?.forced;
  if (forced) {
    mode = forced.mode;
    payload = { ...payload, text: forced.text ?? payload.text };
  }
  return { clock: clockInfo(g), banner, mode, payload };
}

export type ScreenView = Awaited<ReturnType<typeof screenView>>;

// ---------------------------------------------------------------------------------------------

export async function mjView(db: Db) {
  const g = await loadGame(db);
  const players = await db.query<PlayerRow>("select * from players order by badge_code");
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? byId.get(id)?.name ?? byId.get(id)?.badge_code ?? "?" : null);
  const events = await db.query<EventRow>("select * from scheduled_events order by at, label");
  const kills = await db.query<KillRow>("select * from kills order by scanned_at desc");
  const council = await openCouncil(db);
  const votes = council
    ? await db.query<{ voter_id: string; target_id: string | null; weight: number }>("select * from votes where council_id = $1", [council.id])
    : [];
  const logRows = await db.query<{ id: string; at: number | null; wall_at: Date; actor_id: string | null; kind: string; payload: unknown }>(
    "select * from event_log order by id desc limit 300");
  return {
    clock: clockInfo(g),
    settings: mergeSettings(g.settings),
    cooldownUntil: g.conclave_cooldown_until,
    killsOpen: g.kills_open,
    gauge: await computeProgress(db),
    alerts: g.flags.alerts ?? [],
    lastTickAt: g.last_tick_at,
    mjChannel: `mj:${g.channel_secrets.mj}`,
    forced: g.screen_state?.forced ?? null,
    players: players.map((p) => ({
      id: p.id,
      badge: p.badge_code,
      bound: !!p.bound_at,
      name: p.name,
      role: p.role,
      roleName: p.role ? ROLE_BY_ID[p.role].name : null,
      camp: p.camp,
      status: p.status,
      zone: p.zone,
      deathCause: p.death_cause,
      diedAt: p.died_at,
      bellUsed: p.bell_used,
      metals: p.metals,
    })),
    kills: kills.map((k) => ({ ...k, killer: name(k.killer_id), victim: name(k.victim_id) })),
    council: council && {
      ...council,
      caller: name(council.caller_id),
      votes: votes.map((v) => ({ voter: name(v.voter_id), target: v.target_id ? name(v.target_id) : "personne", weight: v.weight })),
    },
    events,
    missions: (await db.query<{ code: string; validated_by: string | null; validated_at: number | null }>("select * from missions order by code"))
      .map((m) => ({ ...m, by: name(m.validated_by), answer: MISSION_BY_CODE[m.code]?.answer })),
    missionCount: MISSIONS.length,
    log: logRows.map((l) => ({ ...l, actor: name(l.actor_id) })),
  };
}
