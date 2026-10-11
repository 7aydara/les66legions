import type { NextRequest } from "next/server";
import { body, db, handle } from "@/lib/api";
import { playerToken } from "@/lib/auth";
import * as E from "@/lib/game/engine";
import { GameError } from "@/lib/game/errors";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(req: NextRequest, ctx: RouteContext<"/api/me/[op]">) {
  const { op } = await ctx.params;
  return handle(async () => {
    const token = playerToken(req);
    if (!token) throw new GameError("Scanne d'abord ton badge.", 401);
    const b = await body(req);
    const database = await db();
    switch (op) {
      case "name": return E.setName(database, token, str(b.name));
      case "scan": return E.scan(database, token, str(b.code));
      case "kill": return E.kill(database, token, str(b.badge));
      case "report": return E.report(database, token, str(b.badge));
      case "bell": return E.ringBell(database, token);
      case "vote": return E.vote(database, token, b.badge ? str(b.badge) : null);
      case "mission": return E.submitMission(database, token, str(b.code), str(b.answer));
      case "death-zone": return E.setDeathZone(database, token, str(b.zone));
      default: throw new GameError("Action inconnue", 404);
    }
  });
}
