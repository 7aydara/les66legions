/** Comparaison des réponses de mission : minuscules, sans accents ni espaces. */
export function normalizeAnswer(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");
}
