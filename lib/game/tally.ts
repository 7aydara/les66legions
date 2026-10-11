// Dépouillement d'un conseil (§4.3, règles précisées par le MJ) :
// - « personne » est une voix exprimée ; s'il est en tête → pas d'expulsion ;
// - dénominateur = somme des poids réels (Frère ×2, Marqué ×2…) ;
// - votes contre un Baal invisible : comptés comme « personne », l'écran affiche 0 pour lui ;
// - égalité en tête → personne ;
// - le plus voté avec ≥ 40 % → expulsion, sinon → roue des châtiments.

export interface BallotIn {
  targetId: string | null;
  weight: number;
}

export interface TallyResult {
  /** Voix affichées par cible (0 pour un joueur invisible). */
  totals: Record<string, number>;
  none: number;
  total: number;
  kind: "expel" | "wheel" | "none";
  targetId: string | null;
  reason: "no_votes" | "none_leads" | "tie" | "threshold" | "below_threshold";
  share: number;
}

export function tally(
  ballots: BallotIn[],
  opts: { marked?: Set<string>; invisible?: Set<string>; threshold: number },
): TallyResult {
  const totals: Record<string, number> = {};
  let none = 0;
  for (const b of ballots) {
    if (b.targetId === null || opts.invisible?.has(b.targetId)) {
      none += b.weight;
      if (b.targetId !== null) totals[b.targetId] ??= 0;
      continue;
    }
    const w = b.weight * (opts.marked?.has(b.targetId) ? 2 : 1);
    totals[b.targetId] = (totals[b.targetId] ?? 0) + w;
  }
  const total = none + Object.values(totals).reduce((a, b) => a + b, 0);
  const base = { totals, none, total };
  if (total === 0) return { ...base, kind: "none", targetId: null, reason: "no_votes", share: 0 };

  const top = Math.max(none, ...Object.values(totals));
  const leaders = Object.entries(totals).filter(([, v]) => v === top).map(([k]) => k);
  if (none === top) {
    return { ...base, kind: "none", targetId: null, reason: leaders.length ? "tie" : "none_leads", share: top / total };
  }
  if (leaders.length > 1) return { ...base, kind: "none", targetId: null, reason: "tie", share: top / total };
  const share = top / total;
  return share >= opts.threshold
    ? { ...base, kind: "expel", targetId: leaders[0], reason: "threshold", share }
    : { ...base, kind: "wheel", targetId: leaders[0], reason: "below_threshold", share };
}
