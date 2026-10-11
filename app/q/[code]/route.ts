// Résolution des QR codes (§8) selon qui scanne.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/api";
import { PLAYER_COOKIE, playerToken, setPlayerCookie } from "@/lib/auth";
import { bindBadge, playerByToken } from "@/lib/game/engine";

export async function GET(req: NextRequest, ctx: RouteContext<"/q/[code]">) {
  const code = decodeURIComponent((await ctx.params).code).trim().toUpperCase();
  const database = await db();
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  const isBadge = /^B\d{2}$/.test(code);

  const me = await playerByToken(database, playerToken(req));
  if (me) {
    if (isBadge && code === me.badge_code) return to("/play");
    return to(`/play?scan=${encodeURIComponent(code)}`);
  }

  if (!isBadge) {
    const res = to("/play?notice=badge_first");
    if (playerToken(req)) res.cookies.delete(PLAYER_COOKIE);
    return res;
  }
  const r = await bindBadge(database, code);
  if ("error" in r) return to(`/play?notice=${r.error === "taken" ? "badge_taken" : "badge_unknown"}`);
  const res = to("/play");
  setPlayerCookie(req, res, r.token);
  return res;
}
