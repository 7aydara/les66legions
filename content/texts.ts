// Textes d'interface et d'écran. Ceux qui viennent de la spec ou du MJ sont déjà définitifs ;
// le reste est en TODO_TEXTE.

export const SUSPECTS = [
  "Séraphine Halloran",
  "Ilan Morrow",
  "Dr Ezra Malkin",
  "Mère Agathe (la Sibylle)",
  "Sénateur Corvin Ashby",
  "Noé Halloran",
] as const;

export const POISONS = ["belladone", "aconit", "ciguë", "mandragore"] as const;

/** Les 3 questions du bandeau de l'écran. */
export const SCREEN_QUESTIONS = [
  "Qui a tué Lucien, et avec quoi ?",
  "Qui est le Premier Roi ?",
  "Combien de fragments du Carnet seront sauvés ?",
];

export const TEXTS = {
  deathScreen: "Tu es mort. Mets ton voile et agenouille-toi.",
  deathZonePrompt: "TODO_TEXTE — Où es-tu tombé ?",
  spiritScreen: "TODO_TEXTE — Tu es un Esprit.",
  killDone: "TODO_TEXTE — Le sort est jeté.",
  glasReport: (name: string) => `Corps signalé par ${name}`,
  glasBell: (name: string) => `Cloche sonnée par ${name}`,
  glasOffice: "Le conseil de minuit est convoqué",
  glasMj: "Le conseil de minuit est convoqué",
  glasAccusation: "TODO_TEXTE — L'Accusation",
  expelledLegion: (name: string) => `${name} servait le Premier Roi`,
  expelledOther: (name: string) => `${name} n'était pas un agent de l'Ordre`,
  noExpulsion: "TODO_TEXTE — Personne n'est expulsé.",
  wheelPlaceholder: (name: string) => `TODO_TEXTE — La roue des châtiments désigne ${name} (v2)`,
  veille: "TODO_TEXTE — La nuit s'étire sur le manoir…",
  intro: "TODO_TEXTE — (vidéo d'intro)",
  lobbyWait: "TODO_TEXTE — Le MJ va bientôt distribuer les rôles.",
};
