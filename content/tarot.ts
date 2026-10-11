// Arcanes de la Cartomancienne (§3.3). v2.
export const ARCANA: { id: string; title: string; body: string }[] = [1, 2, 3, 4].map((n) => ({
  id: `arcane-${n}`, title: `TODO_TEXTE — arcane ${n}`, body: "TODO_TEXTE",
}));
