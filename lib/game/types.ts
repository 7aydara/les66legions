import type { Camp, RoleId } from "@/content/roles";
import type { Phase } from "./timeline";

export type PlayerStatus = "alive" | "corpse" | "spirit" | "expelled";

export interface GameRow {
  id: number;
  phase: Phase;
  act: number;
  launched: boolean;
  launched_at: Date | null;
  paused: boolean;
  clock_gt: number;
  clock_wall: Date;
  settings: Record<string, unknown>;
  screen_state: { forced?: { mode: string; text?: string } };
  conclave_cooldown_until: number;
  kills_open: boolean;
  mission_progress: number;
  flags: { alerts?: Alert[]; thresholds?: number[] } & Record<string, unknown>;
  channel_secrets: { mj?: string; legion?: string; spirits?: string };
  last_tick_at: Date | null;
}

/**
 * Alerte MJ. Les victoires immédiates (legion_win, witness_win) attendent une décision :
 * « continue » (la partie continue) ou « verdict » (saut à la phase verdict puis finale).
 * L'écran n'annonce rien tant que le MJ n'a pas choisi.
 */
export interface Alert {
  kind: string;
  at: number;
  text: string;
  decision?: "continue" | "verdict";
  decidedAt?: number;
}

export interface PlayerRow {
  id: string;
  badge_code: string;
  token: string;
  channel_key: string;
  bound_at: Date | null;
  name: string | null;
  role: RoleId | null;
  camp: Camp | null;
  status: PlayerStatus;
  death_cause: string | null;
  died_at: number | null;
  zone: string | null;
  evacuated_until: number;
  bell_used: boolean;
  flags: { deathZonePending?: boolean } & Record<string, unknown>;
  metals: string[];
}

export type CouncilStage = "glas" | "debate" | "vote" | "count" | "result" | "expulsion" | "closed";
export type CouncilTrigger = "report" | "bell" | "office" | "accusation" | "mj";

export interface CouncilResult {
  totals: Record<string, number>;
  none: number;
  total: number;
  kind: "expel" | "wheel" | "none";
  targetId: string | null;
  reason: string;
  share: number;
}

export interface CouncilRow {
  id: string;
  trigger: CouncilTrigger;
  caller_id: string | null;
  corpse_ids: string[];
  stage: CouncilStage;
  stage_ends_at: number;
  debate_seconds: number;
  opened_at: number;
  closed_at: number | null;
  result: CouncilResult | null;
}

export interface KillRow {
  id: string;
  killer_id: string | null;
  target_id: string | null;
  victim_id: string | null;
  scanned_at: number;
  dies_at: number;
  zone: string | null;
  blocked_reason: string | null;
  resolved: boolean;
}

export interface EventRow {
  id: string;
  kind: string;
  label: string;
  at: number;
  payload: Record<string, unknown>;
  status: "pending" | "done" | "skipped" | "cancelled";
  done_at: number | null;
  note: string | null;
}
