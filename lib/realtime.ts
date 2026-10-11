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

export function realtimeConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function broadcast(db: Db, n: Notify) {
  if (!realtimeConfigured()) return;
  const topics: string[] = [];
  if (n.screen || n.everyone) topics.push("screen");
  for (const key of n.players) topics.push(`player:${key}`);
  if (n.mj) {
    const [g] = await db.query<{ channel_secrets: { mj?: string } }>("select channel_secrets from game where id = 1");
    if (g?.channel_secrets?.mj) topics.push(`mj:${g.channel_secrets.mj}`);
  }
  if (!topics.length) return;
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
