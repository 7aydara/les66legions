import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createPglite } from "@/lib/db";
import { checkMjPassword, hashMjPassword, isMj, setMjCookie } from "@/lib/auth";

const req = (cookie?: string) => new NextRequest("https://les66legions.vercel.app/api/mj", { headers: cookie ? { cookie } : {} });
const cookieOf = (res: NextResponse) => `l66_mj=${res.cookies.get("l66_mj")?.value}`;

describe("mot de passe MJ", () => {
  it("la valeur en base est prioritaire sur MJ_PASSWORD", async () => {
    const db = await createPglite();
    process.env.MJ_PASSWORD = "ancien-mot-de-passe";
    expect(await checkMjPassword(db, "ancien-mot-de-passe")).toBe(true);
    const res1 = NextResponse.json({});
    await setMjCookie(db, req(), res1);
    expect(await isMj(db, req(cookieOf(res1)))).toBe(true);

    await db.query("insert into app_config (key, value) values ('mj_password_hash', $1)", [hashMjPassword("Beleth-secret")]);
    expect(await checkMjPassword(db, "ancien-mot-de-passe")).toBe(false);
    expect(await checkMjPassword(db, "Beleth-secret")).toBe(true);
    // L'ancien cookie (dérivé de MJ_PASSWORD) n'est plus valide.
    expect(await isMj(db, req(cookieOf(res1)))).toBe(false);
    const res2 = NextResponse.json({});
    await setMjCookie(db, req(), res2);
    expect(await isMj(db, req(cookieOf(res2)))).toBe(true);
    expect(await isMj(db, req("l66_mj=faux"))).toBe(false);
    expect(await isMj(db, req())).toBe(false);
    await db.close();
  });
});
