import { NextResponse } from "next/server";
import { getDb, type Database } from "./db";
import { ensureInitialized } from "./game/engine";
import { GameError } from "./game/errors";

const g = globalThis as unknown as { __l66init?: Promise<void> };

/** Traduit une erreur de connexion Postgres en message lisible (sans aucun secret). */
export function describeDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const msg = err?.message ?? String(e);
  if (/DATABASE_URL manquant/.test(msg)) return "DATABASE_URL n'est pas défini dans les variables d'environnement.";
  if (/tenant|user not found/i.test(msg)) return "Le pooler Supabase ne reconnaît pas l'utilisateur : vérifie l'hôte (aws-0 / aws-1) et l'utilisateur « l66_app.<ref-du-projet> » dans DATABASE_URL.";
  if (err?.code === "28P01" || /password authentication failed/i.test(msg)) return "Mot de passe refusé par la base (DATABASE_URL).";
  if (err?.code === "ENOTFOUND" || err?.code === "EAI_AGAIN") return "Hôte de la base introuvable (DATABASE_URL).";
  if (err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT" || /timeout/i.test(msg)) return "Connexion à la base refusée ou expirée (hôte ou port de DATABASE_URL ?).";
  if (err?.code === "42P01") return "Tables absentes : les migrations n'ont pas été appliquées.";
  if (err?.code === "42501") return "Permission refusée : droits du rôle de la base insuffisants.";
  // Les messages du pooler (XX000) ne contiennent pas de secret : on les affiche tels quels.
  if (err?.code === "XX000") return `Le pooler Supabase refuse la connexion : « ${msg.slice(0, 200)} » (vérifie l'hôte aws-0 / aws-1 dans DATABASE_URL).`;
  return `Erreur de base de données${err?.code ? ` (${err.code})` : ""}.`;
}

export async function db(): Promise<Database> {
  try {
    const database = await getDb();
    g.__l66init ??= ensureInitialized(database).catch((e) => {
      g.__l66init = undefined;
      throw e;
    });
    await g.__l66init;
    return database;
  } catch (e) {
    console.error("db", e);
    throw new GameError(describeDbError(e), 503);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return result instanceof Response ? result : json(result);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Erreur serveur" }, 500);
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}
