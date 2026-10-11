// Indices (§4.8). Textes définitifs : TODO_TEXTE. Utilisés à partir du v2.
import type { RoleId } from "./roles";

export interface ClueDef {
  code: string;
  act: 1 | 2 | 3;
  title: string;
  body: string;            // markdown
  image?: string;
  visibility: "public" | RoleId[];
  variants?: Partial<Record<RoleId, { title?: string; body: string }>>;
  isFake?: boolean;
}

const half = (n: number, side: "A" | "B", act: 1 | 2 | 3, holders: RoleId[] | "public"): ClueDef => ({
  code: `C${n}${side}`, act, title: `TODO_TEXTE — indice ${n}${side}`, body: "TODO_TEXTE", visibility: holders,
});

export const CLUES: ClueDef[] = [
  half(1, "A", 1, ["majordome"]), half(1, "B", 1, ["legiste"]),
  half(2, "A", 1, ["legiste"]), half(2, "B", 1, ["sorciere"]),
  half(3, "A", 1, "public"), half(3, "B", 1, "public"),
  half(4, "A", 2, ["templier"]), half(4, "B", 2, ["elie"]),
  half(5, "A", 2, ["capitaine"]), half(5, "B", 2, ["astrologue"]),
  half(6, "A", 2, ["domestique"]), half(6, "B", 2, ["technicien"]),
  half(7, "A", 2, ["notaire"]), half(7, "B", 2, ["legiste"]),
  half(8, "A", 3, ["cryptographe"]), half(8, "B", 3, ["kabbaliste"]),
  half(9, "A", 3, ["notaire"]), half(9, "B", 3, ["confesseur"]),
  half(10, "A", 3, "public"), half(10, "B", 3, ["cartomancienne"]),
];

/** QR d'indices physiques (§8). */
export const PHYSICAL_CLUES = ["I-ACONIT", "I-MAREES", "I-REGISTRE", "I-PLAN", "I-CAMERA", "I-EXLIBRIS"] as const;
