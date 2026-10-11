// Définit le mot de passe du panneau MJ dans la base (prioritaire sur MJ_PASSWORD, sans redéploiement).
//   npm run mj:password -- "mon-mot-de-passe"
//   npm run mj:password -- --clear      (revient à la variable MJ_PASSWORD)
import { config } from "dotenv";
import { getDb } from "../lib/db";
import { hashMjPassword } from "../lib/auth";

config({ path: ".env.local" });
config();

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage : npm run mj:password -- "mot-de-passe"   (ou --clear)');
  const db = await getDb();
  if (arg === "--clear") {
    await db.query("delete from app_config where key = 'mj_password_hash'");
    console.log("Mot de passe MJ en base supprimé : MJ_PASSWORD reprend la main.");
  } else {
    if (arg.length < 8) throw new Error("8 caractères minimum.");
    await db.query(
      `insert into app_config (key, value, updated_at) values ('mj_password_hash', $1, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [hashMjPassword(arg)],
    );
    console.log("Mot de passe MJ enregistré (prise en compte sous 30 s).");
  }
  await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
