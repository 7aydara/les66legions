// Diagnostic de déploiement : état de la configuration et de la connexion à la base.
// N'expose aucun secret (ni mot de passe, ni clé) : seulement l'hôte et l'utilisateur de DATABASE_URL.
import { db, describeDbError, json } from "@/lib/api";
import { GameError } from "@/lib/game/errors";
import { realtimeMode } from "@/lib/realtime";

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  let target: { host: string; port: string; user: string } | null = null;
  try {
    if (url && !url.startsWith("pglite:")) {
      const u = new URL(url);
      target = { host: u.hostname, port: u.port, user: decodeURIComponent(u.username) };
    }
  } catch {
    target = null;
  }
  let database = "ok";
  let started = Date.now();
  try {
    const d = await db();
    started = Date.now();
    await d.query("select 1 from game where id = 1");
  } catch (e) {
    database = e instanceof GameError ? e.message : describeDbError(e);
  }
  return json({
    ok: database === "ok",
    database,
    latencyMs: database === "ok" ? Date.now() - started : null,
    env: {
      DATABASE_URL: url ? (url.startsWith("pglite:") ? "pglite" : "postgres") : "absent",
      databaseTarget: target,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? null,
      MJ_PASSWORD: !!process.env.MJ_PASSWORD,
      realtime: realtimeMode(),
    },
  });
}
