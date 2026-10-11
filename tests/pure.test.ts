import { describe, expect, it } from "vitest";
import { rolesForCount } from "@/lib/game/assign";
import { tally } from "@/lib/game/tally";
import { normalizeAnswer } from "@/lib/game/normalize";
import { ROLE_BY_ID, ROLES } from "@/content/roles";

describe("rolesForCount", () => {
  it("30 joueurs : tous les rôles", () => {
    expect(rolesForCount(30)).toHaveLength(30);
    expect(ROLES.filter((r) => r.camp === "legion")).toHaveLength(5);
    expect(ROLES.filter((r) => r.camp === "witness")).toHaveLength(22);
  });
  it("retire dans l'ordre demandé", () => {
    expect(rolesForCount(28)).not.toContain("martyr");
    expect(rolesForCount(28)).not.toContain("veilleur");
    expect(rolesForCount(28)).toContain("frere");
    expect(rolesForCount(25)).toContain("asmodee");
    const r24 = rolesForCount(24);
    expect(r24).not.toContain("asmodee");
    expect(r24.filter((id) => ROLE_BY_ID[id].camp === "legion")).toHaveLength(4);
    expect(r24).not.toContain("alchimiste");
    expect(r24).toContain("exorciste");
    expect(r24).toContain("judas");
    const r22 = rolesForCount(22);
    expect(r22).toContain("plume");
    expect(r22).not.toContain("judas");
  });
  it("chaque taille de 22 à 30 garde les détenteurs d'indices", () => {
    for (let n = 22; n <= 30; n++) {
      const r = rolesForCount(n);
      expect(r).toHaveLength(n);
      expect(new Set(r).size).toBe(n);
      for (const role of ROLES.filter((x) => x.clueHolder)) expect(r).toContain(role.id);
    }
  });
  it("refuse hors bornes", () => {
    expect(() => rolesForCount(21)).toThrow();
    expect(() => rolesForCount(31)).toThrow();
  });
});

describe("tally", () => {
  const T = { threshold: 0.4 };
  it("expulsion à ≥ 40 %", () => {
    const r = tally([{ targetId: "a", weight: 1 }, { targetId: "a", weight: 1 }, { targetId: "b", weight: 1 }, { targetId: null, weight: 1 }, { targetId: "c", weight: 1 }], T);
    expect(r.kind).toBe("expel");
    expect(r.targetId).toBe("a");
    expect(r.share).toBeCloseTo(0.4);
  });
  it("sous 40 % → roue", () => {
    const r = tally([{ targetId: "a", weight: 2 }, { targetId: "b", weight: 1 }, { targetId: "c", weight: 1 }, { targetId: "d", weight: 1 }, { targetId: null, weight: 1 }], T);
    expect(r.kind).toBe("wheel");
    expect(r.total).toBe(6);
  });
  it("« personne » en tête → pas d'expulsion", () => {
    expect(tally([{ targetId: null, weight: 1 }, { targetId: null, weight: 1 }, { targetId: "a", weight: 1 }], T).reason).toBe("none_leads");
  });
  it("égalité en tête → personne (y compris avec « personne »)", () => {
    expect(tally([{ targetId: "a", weight: 1 }, { targetId: "b", weight: 1 }], T).kind).toBe("none");
    expect(tally([{ targetId: "a", weight: 1 }, { targetId: null, weight: 1 }], T).kind).toBe("none");
  });
  it("Frère ×2 compté au dénominateur", () => {
    const r = tally([{ targetId: "a", weight: 2 }, { targetId: "b", weight: 1 }, { targetId: "c", weight: 1 }, { targetId: "d", weight: 1 }], T);
    expect(r.total).toBe(5);
    expect(r.kind).toBe("expel");
  });
  it("Marqué ×2, Baal invisible = personne et 0 affiché", () => {
    const r = tally([{ targetId: "baal", weight: 1 }, { targetId: "baal", weight: 1 }, { targetId: "m", weight: 1 }], { ...T, marked: new Set(["m"]), invisible: new Set(["baal"]) });
    expect(r.totals.baal).toBe(0);
    expect(r.totals.m).toBe(2);
    expect(r.none).toBe(2);
    expect(r.total).toBe(4);
    expect(r.kind).toBe("none"); // égalité m (2) / personne (2)
  });
  it("aucun vote", () => {
    expect(tally([], T).reason).toBe("no_votes");
  });
});

it("normalizeAnswer", () => {
  expect(normalizeAnswer("  Éclipse  du Roi ")).toBe("eclipseduroi");
});
