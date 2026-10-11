// Timeline par défaut (§2), décalée de −15 min : T+0 = clic « Lancer » = début de la vidéo d'intro.
// Le MJ peut décaler, déclencher ou annuler chaque événement.
export type Phase = "lobby" | "roles" | "intro" | "act1" | "act2" | "act3" | "verdict" | "finale";
export const ACT_PHASES: Phase[] = ["act1", "act2", "act3"];
export const PHASE_ACT: Record<Phase, number> = { lobby: 0, roles: 0, intro: 0, act1: 1, act2: 2, act3: 3, verdict: 3, finale: 3 };

export interface TimelineEntry {
  at: number;
  kind: "phase" | "kills_open" | "council" | "flash" | "fragments" | "screen";
  label: string;
  payload: Record<string, unknown>;
}

const m = (min: number) => min * 60;

export const DEFAULT_TIMELINE: TimelineEntry[] = [
  { at: m(0), kind: "phase", label: "Intro (vidéo)", payload: { phase: "intro" } },
  { at: m(7), kind: "phase", label: "Acte 1", payload: { phase: "act1" } },
  { at: m(15), kind: "kills_open", label: "Meurtres possibles", payload: {} },
  { at: m(25), kind: "flash", label: "Mission éclair : La Veillée des 7", payload: { flash: "veillee7" } },
  { at: m(35), kind: "council", label: "Conseil d'office", payload: { variant: "office" } },
  { at: m(50), kind: "phase", label: "Acte 2", payload: { phase: "act2" } },
  { at: m(65), kind: "flash", label: "Mission éclair : Le Jugement de Salomon", payload: { flash: "salomon" } },
  { at: m(75), kind: "council", label: "Conseil d'office", payload: { variant: "office" } },
  { at: m(90), kind: "flash", label: "Mission éclair codée", payload: { flash: "planche" } },
  { at: m(100), kind: "council", label: "Conseil d'office", payload: { variant: "office" } },
  { at: m(110), kind: "phase", label: "Acte 3", payload: { phase: "act3" } },
  { at: m(120), kind: "fragments", label: "Fragments du Carnet activés", payload: {} },
  { at: m(140), kind: "council", label: "L'Accusation", payload: { variant: "accusation" } },
  { at: m(150), kind: "phase", label: "Verdict", payload: { phase: "verdict" } },
  { at: m(160), kind: "phase", label: "Finale", payload: { phase: "finale" } },
];
