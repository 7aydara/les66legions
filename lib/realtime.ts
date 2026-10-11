// Diffusion Realtime (Supabase Broadcast), envoyée par le serveur après chaque transaction.
// Les messages ne portent qu'un signal « refresh » : le client recharge ensuite sa vue filtrée
// par l'API. Aucun contenu de jeu ne transite par Realtime.
import type { Db } from "./db";

export interface Notify {
  screen: boolean;        // état public changé (écran + tous les clients écoutent `screen`)
  everyone: boolean;      // changement qui concerne tous les joueurs sans être public à l'écran
  players: Set<string>;   // channel_key des joueurs concernés individuellement
  mj: boolean;
}

/**
 * Deux façons d'émettre (signal « refresh » uniquement) :
 * - « rest » : API Broadcast de Supabase avec SUPABASE_SERVICE_ROLE_KEY ;
 * - « db »   : fonction SQL realtime.send() via la connexion Postgres de l'application
 *              (pas besoin de clé service_role ; le rôle doit avoir EXECUTE sur realtime.send
 *              et INSERT sur realtime.messages, voir README).
 * Sans NEXT_PUBLIC_SUPABASE_URL : pas de Realtime, les clients sondent l'API.
 */
export function realtimeMode(): "rest" | "db" | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return "rest";
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("pglite:")) return "db";
  return null;
}

export async function broadcast(db: Db, n: Notify) {
  const mode = realtimeMode();
  if (!mode) return;
  const topics: string[] = [];
  if (n.screen || n.everyone) topics.push("screen");
  for (const key of n.players) topics.push(`player:${key}`);
  if (n.mj) {
    const [g] = await db.query<{ channel_secrets: { mj?: string } }>("select channel_secrets from game where id = 1");
    if (g?.channel_secrets?.mj) topics.push(`mj:${g.channel_secrets.mj}`);
  }
  if (!topics.length) return;

  if (mode === "db") {
    const values = topics.map((_, i) => `($${i + 1})`).join(", ");
    await db.query(`select realtime.send('{}'::jsonb, 'refresh', t, false) from (values ${values}) as v(t)`, topics);
    return;
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ messages: topics.map((topic) => ({ topic, event: "refresh", payload: {} })) }),
  });
  if (!res.ok) console.error("realtime broadcast", res.status, await res.text().catch(() => ""));
}
