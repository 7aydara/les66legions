import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Couche d'accès minimale commune à postgres.js (prod / Supabase) et PGlite (tests, dev sans Docker).
 * Toutes les requêtes sont du SQL paramétré ($1, $2…). Les valeurs jsonb se passent en JSON.stringify
 * avec un cast explicite ($1::jsonb).
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Db {
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function migrationsSql(): string[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
}

export async function createPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  for (const sql of migrationsSql()) await pg.exec(sql);
  return {
    async query(text, params) {
      const r = await pg.query(text, params);
      return r.rows as never[];
    },
    tx(fn) {
      return pg.transaction(async (t) =>
        fn({
          async query(text, params) {
            const r = await t.query(text, params);
            return r.rows as never[];
          },
        }),
      );
    },
    close: () => pg.close(),
  };
}

export async function createPostgres(url: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  // prepare: false → compatible avec le pooler Supabase en mode transaction (port 6543).
  const sql = postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    // realtime.send() avale ses erreurs (ex. partition du jour absente) et ne lève qu'un WARNING :
    // on le fait remonter dans les logs, sinon les signaux Realtime se perdraient en silence.
    onnotice: (n) => {
      if (n.severity === "WARNING") console.warn("postgres:", n.message);
    },
  });
  // postgres.js sérialise lui-même les paramètres typés json/jsonb : une chaîne JSON passée à
  // « $1::jsonb » serait ré-encodée (stockée comme chaîne JSON). On force donc « $1::text::jsonb ».
  const fixJsonb = (text: string) => text.replace(/(\$\d+)::jsonb/g, "$1::text::jsonb");
  const wrap = (s: { unsafe: typeof sql.unsafe }): Db => ({
    async query(text, params) {
      return (await s.unsafe(fixJsonb(text), (params ?? []) as never[])) as never[];
    },
  });
  return {
    ...wrap(sql),
    tx: (fn) => sql.begin((t) => fn(wrap(t))) as never,
    close: () => sql.end(),
  };
}

const g = globalThis as unknown as { __l66db?: Promise<Database> };

/** Base de l'application, choisie par DATABASE_URL : postgres://… ou pglite:<dossier>. */
export function getDb(): Promise<Database> {
  if (!g.__l66db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquant (voir .env.example)");
    g.__l66db = url.startsWith("pglite:")
      ? createPglite(url.slice("pglite:".length) || undefined)
      : createPostgres(url);
  }
  return g.__l66db;
}
