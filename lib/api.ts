import { NextResponse } from "next/server";
import { getDb, type Database } from "./db";
import { ensureInitialized } from "./game/engine";
import { GameError } from "./game/errors";

const g = globalThis as unknown as { __l66init?: Promise<void> };

export async function db(): Promise<Database> {
  const database = await getDb();
  g.__l66init ??= ensureInitialized(database).catch((e) => {
    g.__l66init = undefined;
    throw e;
  });
  await g.__l66init;
  return database;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
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
