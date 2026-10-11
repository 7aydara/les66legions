// Zones de la salle (§3.4, §8). Noms définitifs : TODO_TEXTE sauf ceux cités dans la spec.
export type ZoneCode = "BIB" | "CHA" | "SER" | "PON" | "ARC" | "SAL";

export const ZONES: { code: ZoneCode; name: string }[] = [
  { code: "BIB", name: "TODO_TEXTE (BIB)" },
  { code: "CHA", name: "La Chapelle" },
  { code: "SER", name: "La Serre" },
  { code: "PON", name: "Le Ponton" },
  { code: "ARC", name: "TODO_TEXTE (ARC)" },
  { code: "SAL", name: "TODO_TEXTE (SAL)" },
];

export const ZONE_CODES = ZONES.map((z) => z.code);

export function zoneName(code: string | null | undefined): string {
  return ZONES.find((z) => z.code === code)?.name ?? "—";
}
