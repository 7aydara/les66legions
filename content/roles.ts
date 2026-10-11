// Rôles des 66 Légions. Les noms et règles viennent de SPEC.md §3 ; tout texte d'ambiance
// (description, objectif rédigé) est un placeholder TODO_TEXTE.

export type Camp = "legion" | "neutral" | "witness";

export type RoleId =
  | "baal" | "paimon" | "beleth" | "purson" | "asmodee"
  | "judas" | "plume" | "alchimiste"
  | "inquisiteur" | "medium" | "sorciere" | "exorciste" | "archiviste" | "cryptographe"
  | "legiste" | "kabbaliste" | "astrologue" | "cartomancienne" | "templier" | "frere"
  | "elie" | "majordome" | "domestique" | "capitaine" | "notaire" | "technicien"
  | "garde" | "confesseur" | "veilleur" | "martyr";

export interface PowerDef {
  label: string;
  rule: string;   // règle mécanique (SPEC)
  limit: string;
}

export interface RoleDef {
  id: RoleId;
  name: string;
  camp: Camp;
  objective: string;
  description: string;
  powers: PowerDef[];
  /** Détient une moitié d'indice de la chaîne (§4.8) : jamais retiré automatiquement. */
  clueHolder: boolean;
  metal?: string;
}

export const CAMP_LABELS: Record<Camp, string> = {
  legion: "La Légion",
  neutral: "Neutre",
  witness: "Témoin",
};

const LEGION_OBJECTIVE = "TODO_TEXTE — objectif de la Légion";
const WITNESS_OBJECTIVE = "TODO_TEXTE — objectif des Témoins";

const legion = (id: RoleId, name: string, power: PowerDef): RoleDef => ({
  id, name, camp: "legion", objective: LEGION_OBJECTIVE, description: "TODO_TEXTE",
  powers: [
    { label: "Meurtre partagé", rule: "Scanne le badge d'une victime : elle meurt 90 s plus tard. Un seul meurtre pour toute la Légion, puis temps de recharge.", limit: "Partagé" },
    power,
  ],
  clueHolder: false,
});

const witness = (id: RoleId, name: string, powers: PowerDef[], opts: { clueHolder?: boolean; metal?: string } = {}): RoleDef => ({
  id, name, camp: "witness", objective: WITNESS_OBJECTIVE, description: "TODO_TEXTE",
  powers, clueHolder: opts.clueHolder ?? false, metal: opts.metal,
});

export const ROLES: RoleDef[] = [
  legion("baal", "Baal, le Premier Roi", { label: "Invisibilité", rule: "À activer avant ou pendant un conseil : les votes contre lui sont annulés.", limit: "1/partie" }),
  legion("paimon", "Paimon, Maître des Langues", { label: "Fausse prophétie", rule: "Rédige un faux indice affiché à l'écran.", limit: "1/acte" }),
  legion("beleth", "Beleth, le Roi Terrible", { label: "Éclipse", rule: "3 min, tous les scans de missions refusés.", limit: "1/acte, dès l'acte 2" }),
  legion("purson", "Purson, qui voit le passé", { label: "Voyance", rule: "Scanne un badge et lit le rôle exact.", limit: "1/acte" }),
  legion("asmodee", "Asmodée, le Corrupteur", { label: "Pacte", rule: "Propose à un Témoin de rejoindre la Légion.", limit: "1/partie, dès l'acte 2" }),

  { id: "judas", name: "Judas", camp: "neutral", objective: "Être expulsé par vote avant l'acte 3.", description: "TODO_TEXTE", clueHolder: false,
    powers: [{ label: "Faux rôle", rule: "Ton interface affiche un rôle de Témoin crédible tant que tu le maintiens. Tu apparais Légion à l'Inquisiteur.", limit: "permanent" }] },
  { id: "plume", name: "La Plume, journaliste", camp: "neutral", objective: "Scanner toi-même au moins 2 fragments du Carnet.", description: "TODO_TEXTE", clueHolder: false,
    powers: [{ label: "Scoop", rule: "Reçois 1 fait vrai par acte et publie-le à l'écran.", limit: "1/acte" }] },
  { id: "alchimiste", name: "L'Alchimiste", camp: "neutral", objective: "Posséder les 7 métaux à la fin.", description: "TODO_TEXTE", clueHolder: false,
    powers: [{ label: "Transmutation", rule: "Chaque métal reçu = 1 question oui/non au MJ.", limit: "1 par métal" }] },

  witness("inquisiteur", "L'Inquisiteur", [{ label: "Inquisition", rule: "Scanne un badge → camp du joueur.", limit: "1/acte" }]),
  witness("medium", "Le Médium", [{ label: "Relais", rule: "Reçois les messages des Esprits.", limit: "passif" }]),
  witness("sorciere", "La Sorcière d'Endor", [
    { label: "Potion de vie", rule: "Ressuscite un Esprit mort depuis moins de 5 min.", limit: "1/partie" },
    { label: "Malédiction", rule: "Tue un joueur (mort différée 90 s).", limit: "1/partie" },
  ], { clueHolder: true }),
  witness("exorciste", "L'Exorciste", [{ label: "Cercle de sel", rule: "Protège un badge pour l'acte en cours (pas le sien deux actes de suite).", limit: "1/acte" }]),
  witness("archiviste", "L'Archiviste", [{ label: "Mémoire", rule: "Voit un symbole ✶ sur les fausses prophéties.", limit: "passif" }]),
  witness("cryptographe", "Le Cryptographe", [{ label: "Clés", rule: "Atbash, chiffre maçonnique, morse ; reçoit la traduction des messages « Planche ».", limit: "passif" }], { clueHolder: true }),
  witness("legiste", "Le Légiste", [{ label: "Autopsie", rule: "Scanne un corps → heure de la mort + 1re lettre du prénom du tueur.", limit: "1/acte" }], { clueHolder: true }),
  witness("kabbaliste", "Le Kabbaliste", [{ label: "Gématrie", rule: "Table de gématrie et lexique hébreu.", limit: "passif" }], { clueHolder: true }),
  witness("astrologue", "L'Astrologue", [{ label: "Présage", rule: "Alerte 2 min avant chaque Éclipse.", limit: "passif" }], { clueHolder: true, metal: "etain" }),
  witness("cartomancienne", "La Cartomancienne", [{ label: "Arcane", rule: "Tire 1 arcane par acte.", limit: "1/acte" }], { clueHolder: true, metal: "cuivre" }),
  witness("templier", "Le Templier", [{ label: "Non nobis", rule: "Annule le résultat d'un vote dans les 30 s après l'annonce.", limit: "1/partie" }], { clueHolder: true, metal: "fer" }),
  witness("frere", "Le Frère de la Loge", [{ label: "Vote double", rule: "Ta voix compte double. Tu connais l'identité du Templier.", limit: "passif" }]),
  witness("elie", "Le Prophète Élie", [{ label: "Duel du Carmel", rule: "Désigne un suspect : s'il est de la Légion il est expulsé, sinon tu meurs.", limit: "1/partie" }], { clueHolder: true }),
  witness("majordome", "Le Majordome", [{ label: "Fermeture", rule: "Ferme une zone 5 min : aucun meurtre possible sur un joueur qui l'a déclarée.", limit: "1/acte" }], { clueHolder: true, metal: "plomb" }),
  witness("domestique", "Le Domestique", [{ label: "Registre", rule: "Consulte les 3 derniers scans d'une station de mission.", limit: "1/acte" }], { clueHolder: true, metal: "mercure" }),
  witness("capitaine", "Le Capitaine", [{ label: "Évacuation", rule: "Un joueur est mis hors jeu 10 min.", limit: "1/partie" }], { clueHolder: true, metal: "argent" }),
  witness("notaire", "Le Notaire", [{ label: "Testament", rule: "Enveloppe scellée ouverte en acte 3, ou à ta mort si elle survient avant.", limit: "—" }], { clueHolder: true, metal: "or" }),
  witness("technicien", "Le Technicien", [{ label: "Réparation", rule: "Stoppe une Éclipse en cours. Débloque l'image caméra après 3 missions validées.", limit: "1/acte" }], { clueHolder: true }),
  witness("garde", "Le Garde du corps", [{ label: "Protection", rule: "Choisis un protégé par acte ; s'il est visé, c'est toi qui meurs.", limit: "1/acte" }]),
  witness("confesseur", "Le Confesseur", [{ label: "Confession", rule: "Reçois des messages anonymes. Une fois : révèle le rôle du dernier expéditeur.", limit: "1/partie" }], { clueHolder: true }),
  witness("veilleur", "Le Veilleur", [{ label: "Veille", rule: "Après chaque meurtre, reçois la zone où il a eu lieu.", limit: "passif" }]),
  witness("martyr", "Le Martyr", [{ label: "Dernier souffle", rule: "À ta mort, choisis un joueur dont le camp s'affiche à l'écran.", limit: "à la mort" }]),
];

export const ROLE_BY_ID: Record<RoleId, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, RoleDef>;

export function isRoleId(x: unknown): x is RoleId {
  return typeof x === "string" && x in ROLE_BY_ID;
}
