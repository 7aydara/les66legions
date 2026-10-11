import { beforeEach, describe, expect, it } from "vitest";
import { createPglite, createPostgres, migrationsSql, type Database } from "@/lib/db";
import * as E from "@/lib/game/engine";
import { mjView, playerView, screenView } from "@/lib/game/views";
import { DEFAULT_SETTINGS as S } from "@/lib/game/settings";
import { ROLES } from "@/content/roles";

let db: Database;
let tokens: Record<string, string>; // badge -> token

async function players() {
  return (await mjView(db)).players.filter((p) => p.role);
}
async function byRole(role: string) {
  const p = (await players()).find((x) => x.role === role)!;
  return { ...p, token: tokens[p.badge] };
}
/** PGlite par défaut ; TEST_DATABASE_URL=postgres://… pour tester le chemin de prod (base vidée !). */
async function freshDb(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createPglite();
  if (db) await db.close().catch(() => {});
  const pg = await createPostgres(url);
  await pg.query("drop schema public cascade");
  await pg.query("create schema public");
  for (const sql of migrationsSql()) await pg.query(sql);
  return pg;
}

async function setup(n = 30) {
  db = await freshDb();
  await E.resetGame(db, { keepPlayers: false });
  tokens = {};
  for (const badge of E.BADGE_CODES.slice(0, n)) {
    const r = await E.bindBadge(db, badge);
    if (!("token" in r)) throw new Error("bind");
    tokens[badge] = r.token;
    await E.setName(db, r.token, `Joueur ${badge}`);
  }
  await E.assignRoles(db);
}
/** Avance l'horloge par pas, comme le tick du MJ. */
async function advance(seconds: number, step = 5) {
  for (let t = 0; t < seconds; t += step) await E.warp(db, Math.min(step, seconds - t));
}
async function launchToKills() {
  await E.launch(db);
  await advance(15 * 60, 30); // meurtres possibles à T+15
}

describe("lobby et badges", () => {
  beforeEach(() => setup());

  it("un badge déjà lié est refusé", async () => {
    expect(await E.bindBadge(db, "B01")).toEqual({ error: "taken" });
    expect(await E.bindBadge(db, "B99")).toEqual({ error: "unknown" });
  });

  it("attribue 30 rôles distincts et passe en phase roles", async () => {
    const ps = await players();
    expect(ps).toHaveLength(30);
    expect(new Set(ps.map((p) => p.role)).size).toBe(30);
    expect((await mjView(db)).clock.phase).toBe("roles");
  });

  it("aucune vue joueur ne contient le rôle d'un autre (hors alliés Légion)", async () => {
    const ps = await players();
    for (const p of ps) {
      const v = JSON.stringify(await playerView(db, tokens[p.badge]));
      for (const other of ps) {
        if (other.id === p.id) continue;
        if (p.camp === "legion" && other.camp === "legion") continue;
        if (p.role === "frere" && other.role === "templier") continue;
        const def = ROLES.find((r) => r.id === other.role)!;
        if (def.id === p.role) continue;
        expect(v.includes(`"${other.role}"`) || v.includes(def.name), `${p.role} voit ${other.role}`).toBe(false);
      }
    }
    const screen = JSON.stringify(await screenView(db));
    for (const r of ROLES) expect(screen.includes(`"${r.id}"`)).toBe(false);
  });

  it("la Légion voit ses 4 alliés", async () => {
    const baal = await byRole("baal");
    const v = await playerView(db, baal.token);
    expect(v && "legion" in v && v.legion?.allies).toHaveLength(4);
  });
});

describe("partie", () => {
  beforeEach(() => setup());

  it("suit la timeline décalée (act1 à T+7, meurtres à T+15)", async () => {
    await E.launch(db);
    expect((await mjView(db)).clock.phase).toBe("intro");
    await advance(7 * 60, 30);
    const v = await mjView(db);
    expect(v.clock.phase).toBe("act1");
    expect(v.killsOpen).toBe(false);
    await advance(8 * 60, 30);
    expect((await mjView(db)).killsOpen).toBe(true);
  });

  it("meurtre différé de 90 s, cooldown partagé, refus contre un agent", async () => {
    await launchToKills();
    const baal = await byRole("baal");
    const paimon = await byRole("paimon");
    const victim = await byRole("medium");
    await expect(E.kill(db, baal.token, paimon.badge)).rejects.toThrow(/frère/);
    await E.kill(db, baal.token, victim.badge);
    await expect(E.kill(db, paimon.token, (await byRole("notaire")).badge)).rejects.toThrow(/attendre/);
    await advance(85);
    expect((await byRole("medium")).status).toBe("alive");
    const before = await playerView(db, victim.token);
    expect(before?.me.status).toBe("alive");
    await advance(10);
    expect((await byRole("medium")).status).toBe("corpse");
    const after = await playerView(db, victim.token);
    expect(after?.me.deathZonePending).toBe(true);
    await E.setDeathZone(db, victim.token, "CHA");
    expect((await mjView(db)).kills[0].zone).toBe("CHA");
    // cooldown de 12 min
    await advance(S.conclaveCooldown - 95 - 5);
    await expect(E.kill(db, paimon.token, (await byRole("notaire")).badge)).rejects.toThrow(/attendre/);
    await advance(10);
    await E.kill(db, paimon.token, (await byRole("notaire")).badge);
  });

  it("signalement → conseil, corps → Esprits, vote et expulsion", async () => {
    await launchToKills();
    const baal = await byRole("baal");
    const victim = await byRole("medium");
    const reporter = await byRole("legiste");
    await E.kill(db, baal.token, victim.badge);
    await advance(95);
    const scan = await E.scan(db, reporter.token, victim.badge);
    expect(scan.kind === "player" && scan.actions.map((a) => a.id)).toEqual(["report"]);
    await E.report(db, reporter.token, victim.badge);
    let sv = await screenView(db);
    expect(sv.mode).toBe("glas");
    expect(sv.payload.line).toBe(`Corps signalé par ${reporter.name}`);
    expect(sv.payload.corpses).toEqual([victim.name]);
    expect((await byRole("medium")).status).toBe("spirit");
    // meurtres bloqués pendant le conseil
    await expect(E.kill(db, (await byRole("paimon")).token, reporter.badge)).rejects.toThrow();

    await advance(S.glasDuration + S.debateDuration);
    sv = await screenView(db);
    expect(sv.mode).toBe("conseil");
    expect(sv.payload.stage).toBe("vote");

    // Tous les vivants votent contre Baal, sauf la Légion qui vote « personne ».
    const alive = (await players()).filter((p) => p.status === "alive");
    for (const p of alive) {
      if (p.id === baal.id) continue;
      await E.vote(db, tokens[p.badge], p.camp === "legion" ? null : baal.badge);
    }
    await expect(E.vote(db, baal.token, baal.badge)).rejects.toThrow(/soi-même/);
    await expect(E.vote(db, victim.token, null)).rejects.toThrow(/vivants/);
    await advance(S.voteDuration);
    sv = await screenView(db);
    expect(sv.payload.stage).toBe("count");
    expect((sv.payload.result as { kind: string }).kind).toBe("expel");
    await advance(S.countDuration + S.templarWindow);
    sv = await screenView(db);
    expect(sv.mode).toBe("expulsion");
    expect(sv.payload.text).toBe(`${baal.name} servait le Premier Roi`);
    expect((await byRole("baal")).status).toBe("spirit");
    await advance(S.expulsionDuration);
    expect((await screenView(db)).mode).toBe("veille");
  });

  it("une mort qui tomberait pendant un conseil est reportée à la clôture + 30 s", async () => {
    await launchToKills();
    const victim = await byRole("medium");
    await E.kill(db, (await byRole("baal")).token, victim.badge);
    await advance(30);
    await E.ringBell(db, (await byRole("notaire")).token);
    await expect(E.ringBell(db, (await byRole("notaire")).token)).rejects.toThrow();
    expect((await screenView(db)).payload.line).toBe(`Cloche sonnée par ${(await byRole("notaire")).name}`);
    // Personne ne vote : le conseil se clôt sans expulsion après glas + débat + vote + dépouillement + fenêtre.
    const len = S.glasDuration + S.debateDuration + S.voteDuration + S.countDuration + S.templarWindow;
    await advance(len);
    expect((await mjView(db)).council).toBeNull();
    expect((await byRole("medium")).status).toBe("alive");
    await advance(25);
    expect((await byRole("medium")).status).toBe("alive");
    await advance(10);
    expect((await byRole("medium")).status).toBe("corpse");
  });

  it("conseil d'office sauté si un conseil s'est clos dans les 10 min", async () => {
    await E.launch(db);
    await advance(30 * 60, 30); // T+30
    await E.ringBell(db, (await byRole("notaire")).token);
    await advance(6 * 60); // conseil clos vers T+35:58 → le conseil d'office de T+35 est sauté (conseil en cours)
    const ev = (await mjView(db)).events.find((e) => e.at === 35 * 60)!;
    expect(ev.status).toBe("skipped");
  });

  it("conseil d'office : glas sans nom", async () => {
    await E.launch(db);
    await advance(35 * 60, 30);
    const sv = await screenView(db);
    expect(sv.mode).toBe("glas");
    expect(sv.payload.line).toBe("Le conseil de minuit est convoqué");
  });

  it("missions : 3 essais, verrou 2 min, Légion jamais comptée, jauge", async () => {
    await E.launch(db);
    await advance(7 * 60, 30);
    const w = await byRole("templier");
    const baal = await byRole("baal");
    const r1 = await E.submitMission(db, baal.token, "M-BIB-1", "TODO_TEXTE");
    expect(r1.status).toBe("not_counted");
    for (let i = 0; i < 2; i++) expect((await E.submitMission(db, w.token, "M-BIB-1", "faux")).status).toBe("wrong");
    expect((await E.submitMission(db, w.token, "M-BIB-1", "faux")).status).toBe("locked");
    await expect(E.submitMission(db, w.token, "M-BIB-1", "TODO_TEXTE")).rejects.toThrow(/verrouillée/);
    await advance(S.missionLock);
    expect((await E.submitMission(db, w.token, "M-BIB-1", " todo_texte ")).status).toBe("validated");
    expect((await E.submitMission(db, baal.token, "M-BIB-1", "x")).status).toBe("already");
    expect((await screenView(db)).banner.gauge).toBeCloseTo(1 / 24);
    // zone associée par le scan
    await E.scan(db, w.token, "M-SER-2");
    expect((await byRole("templier")).zone).toBe("SER");
  });

  it("l'écran compte les corps non découverts parmi les vivants", async () => {
    await launchToKills();
    await E.kill(db, (await byRole("baal")).token, (await byRole("medium")).badge);
    await advance(100);
    const sv = await screenView(db);
    expect(sv.banner.alive).toBe(30);
    expect(sv.banner.spirits).toBe(0);
  });

  it("pause : l'horloge et les morts différées sont gelées", async () => {
    await launchToKills();
    await E.kill(db, (await byRole("baal")).token, (await byRole("medium")).badge);
    await E.setPaused(db, true);
    await expect(E.warp(db, 200)).resolves.toBeTruthy(); // warp avance l'horloge mais le tick ne fait rien en pause
    expect((await byRole("medium")).status).toBe("alive");
    await E.setPaused(db, false);
    await E.tick(db);
    expect((await byRole("medium")).status).toBe("corpse");
  });

  it("tick idempotent : deux ticks simultanés", async () => {
    await E.launch(db);
    await Promise.all([E.tick(db), E.tick(db), E.warp(db, 7 * 60), E.tick(db)]);
    const v = await mjView(db);
    expect(v.events.filter((e) => e.label === "Acte 1" && e.status === "done")).toHaveLength(1);
    expect(v.log.filter((l) => l.kind === "phase" && (l.payload as { phase: string }).phase === "act1")).toHaveLength(1);
  });

  it("parité : la Légion gagne seulement si agents vivants ≥ non-Légion vivants (Neutres inclus)", async () => {
    await E.launch(db);
    await advance(7 * 60, 30);
    const nonLegion = (await players()).filter((p) => p.camp !== "legion");
    expect(nonLegion).toHaveLength(25);
    // 18 Témoins morts : il reste 4 Témoins + 3 Neutres = 7 non-Légion > 5 agents → pas d'alerte.
    for (const w of nonLegion.filter((p) => p.camp === "witness").slice(0, 18)) await E.mjKill(db, w.id);
    expect((await mjView(db)).alerts).toHaveLength(0);
    for (const p of (await players()).filter((p) => p.camp !== "legion" && p.status === "alive").slice(0, 2)) await E.mjKill(db, p.id);
    const alerts = (await mjView(db)).alerts;
    expect(alerts.map((a) => a.kind)).toEqual(["legion_win"]);
    expect(alerts[0].decision).toBeUndefined();
    // L'écran n'annonce rien tant que le MJ n'a pas choisi.
    expect(JSON.stringify(await screenView(db))).not.toMatch(/victoire|legion_win/i);
  });

  it("victoire immédiate → « Continuer » : la partie suit sa timeline", async () => {
    await E.launch(db);
    await advance(7 * 60, 30);
    for (const p of (await players()).filter((p) => p.camp === "legion")) await E.mjKill(db, p.id);
    expect((await mjView(db)).alerts.map((a) => a.kind)).toEqual(["witness_win"]);
    await expect(E.mjDecideAlert(db, "witness_win", "continue")).resolves.toBeTruthy();
    await expect(E.mjDecideAlert(db, "witness_win", "verdict")).rejects.toThrow(/déjà/);
    await advance(60);
    const v = await mjView(db);
    expect(v.clock.phase).toBe("act1");
    expect(v.alerts[0].decision).toBe("continue");
  });

  it("victoire immédiate → « Passer au verdict » : verdict maintenant, finale 10 min après", async () => {
    await E.launch(db);
    await advance(30 * 60, 30);
    await E.ringBell(db, (await byRole("notaire")).token); // un conseil en cours est clos par le saut
    for (const p of (await players()).filter((p) => p.camp === "legion")) await E.mjKill(db, p.id);
    await E.mjDecideAlert(db, "witness_win", "verdict");
    let v = await mjView(db);
    expect(v.clock.phase).toBe("verdict");
    expect(v.council).toBeNull();
    expect(v.events.filter((e) => e.status === "pending").map((e) => e.label)).toEqual(["Finale"]);
    expect(v.events.find((e) => e.label === "Acte 2")?.status).toBe("cancelled");
    await advance(10 * 60, 30);
    v = await mjView(db);
    expect(v.clock.phase).toBe("finale");
  });

  it("Judas expulsé avant l'acte 3 : alerte « Vu » seulement, pas de passage au verdict", async () => {
    await E.launch(db);
    await advance(7 * 60, 30);
    const judas = await byRole("judas");
    await E.ringBell(db, (await byRole("notaire")).token);
    await advance(S.glasDuration + S.debateDuration);
    for (const p of (await players()).filter((p) => p.status === "alive" && p.id !== judas.id)) {
      await E.vote(db, tokens[p.badge], judas.badge);
    }
    await advance(S.voteDuration + S.countDuration + S.templarWindow + S.expulsionDuration);
    expect((await byRole("judas")).status).toBe("spirit");
    expect((await mjView(db)).alerts.map((a) => a.kind)).toEqual(["judas_win"]);
    await expect(E.mjDecideAlert(db, "judas_win", "verdict")).rejects.toThrow(/ne permet pas/);
    await E.mjDecideAlert(db, "judas_win", "continue");
    expect((await mjView(db)).alerts[0].decision).toBe("continue");
  });
});

describe("moins de joueurs", () => {
  it("24 joueurs : 4 agents", async () => {
    await setup(24);
    const ps = await players();
    expect(ps).toHaveLength(24);
    expect(ps.filter((p) => p.camp === "legion")).toHaveLength(4);
  });
});
