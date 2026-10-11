import { ROLES, ROLE_BY_ID, type RoleId } from "@/content/roles";
import { randomInt } from "node:crypto";

export const MIN_PLAYERS = 22;
export const MAX_PLAYERS = 30;

/** Ordre de retrait des rôles quand il y a moins de 30 joueurs (décision MJ). */
export const REMOVAL_ORDER: RoleId[] = ["martyr", "veilleur", "frere", "garde", "alchimiste", "exorciste", "judas", "plume"];
/** En dessous de ce nombre de joueurs, Asmodée est aussi retiré (4 agents). */
export const ASMODEE_THRESHOLD = 25;

export function rolesForCount(n: number): RoleId[] {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new Error(`L'attribution automatique demande entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs (ici ${n}).`);
  }
  const removed = new Set<RoleId>();
  if (n < ASMODEE_THRESHOLD) removed.add("asmodee");
  for (const id of REMOVAL_ORDER) {
    if (ROLES.length - removed.size <= n) break;
    if (ROLE_BY_ID[id].clueHolder) continue; // jamais retiré automatiquement
    removed.add(id);
  }
  const roles = ROLES.map((r) => r.id).filter((id) => !removed.has(id));
  if (roles.length !== n) throw new Error(`Impossible de composer ${n} rôles automatiquement.`);
  return roles;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
