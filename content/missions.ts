// Missions (§4.6). Énoncés et réponses définitifs : TODO_TEXTE (fournis par le dossier de conception).
// La réponse est comparée après normalisation (minuscules, sans accents ni espaces).
import { ZONE_CODES, type ZoneCode } from "./zones";

export interface MissionDef {
  code: string;
  zone: ZoneCode | null;
  kind: "witness" | "spirit";
  title: string;
  statement: string;
  answer: string;
}

export const MISSIONS: MissionDef[] = [
  ...ZONE_CODES.flatMap((zone) =>
    [1, 2, 3, 4].map((n) => ({
      code: `M-${zone}-${n}`,
      zone,
      kind: "witness" as const,
      title: `TODO_TEXTE — mission ${zone}-${n}`,
      statement: "TODO_TEXTE",
      answer: "TODO_TEXTE",
    })),
  ),
  ...[1, 2, 3, 4].map((n) => ({
    code: `E${n}`,
    zone: null,
    kind: "spirit" as const,
    title: `TODO_TEXTE — mission de l'au-delà ${n}`,
    statement: "TODO_TEXTE",
    answer: "TODO_TEXTE",
  })),
];

export const MISSION_BY_CODE: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.code, m]));
