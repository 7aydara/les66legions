// Missions éclair (§4.7). Contenu : TODO_TEXTE. Utilisées à partir du v2.
export const FLASH_MISSIONS = {
  veillee7: { title: "La Veillée des 7", body: "TODO_TEXTE" },
  salomon: { title: "Le Jugement de Salomon", body: "TODO_TEXTE" },
  balthazar: { title: "TODO_TEXTE", body: "TODO_TEXTE", word: "TODO_TEXTE" },
  silence: { title: "TODO_TEXTE", body: "TODO_TEXTE" },
  etoiles: { title: "TODO_TEXTE", body: "TODO_TEXTE" },
  nombres: { title: "TODO_TEXTE", body: "144 · 66" },
  planche: { title: "TODO_TEXTE", body: "TODO_TEXTE" },
} as const;
export type FlashId = keyof typeof FLASH_MISSIONS;
