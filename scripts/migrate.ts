// Applique supabase/migrations/*.sql sur DATABASE_URL (postgres://…). Les migrations sont idempotentes.
import { config } from "dotenv";
import { createPostgres, migrationsSql } from "../lib/db";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("pglite:")) {
    console.log("DATABASE_URL pointe sur PGlite : les migrations sont appliquées automatiquement au démarrage.");
    return;
  }
  const db = await createPostgres(url);
  for (const sql of migrationsSql()) await db.query(sql);
  await db.close();
  console.log("Migrations appliquées.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
