// Réglages modifiables depuis le panneau MJ (stockés en surcharge dans game.settings).
// Toutes les durées sont en secondes de jeu.
export const DEFAULT_SETTINGS = {
  conclaveCooldown: 12 * 60,
  deathDelay: 90,
  glasDuration: 10,
  debateDuration: 4 * 60,
  accusationDebateDuration: 6 * 60,
  voteDuration: 60,
  countDuration: 8,
  templarWindow: 30,
  expulsionDuration: 15,
  /** Un conseil d'office est sauté si un conseil s'est clos dans cette fenêtre. */
  officeSkipWindow: 10 * 60,
  /** Mort différée tombant pendant un conseil : reportée à la clôture + ce délai. */
  postCouncilDeathDelay: 30,
  expelThreshold: 0.4,
  missionAttempts: 3,
  missionLock: 2 * 60,
  /** Durée couverte par l'horloge de la nuit (22h00 → 06h00), depuis « Lancer ». */
  nightDuration: 2 * 3600 + 40 * 60,
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export function mergeSettings(overrides: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (overrides && typeof overrides === "object") {
    for (const [k, v] of Object.entries(overrides)) {
      if (k in s && typeof v === "number" && Number.isFinite(v) && v >= 0) s[k as SettingKey] = v;
    }
  }
  return s;
}
