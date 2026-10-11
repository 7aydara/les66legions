import { NextResponse, type NextRequest } from "next/server";
import { body, db, handle, json } from "@/lib/api";
import { checkMjPassword, isMj, setMjCookie } from "@/lib/auth";
import * as E from "@/lib/game/engine";
import { GameError } from "@/lib/game/errors";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(req: NextRequest, ctx: RouteContext<"/api/mj/[op]">) {
  const { op } = await ctx.params;
  const b = await body(req);
  if (op === "login") {
    if (!process.env.MJ_PASSWORD) return json({ error: "MJ_PASSWORD n'est pas configuré" }, 500);
    if (!checkMjPassword(str(b.password))) return json({ error: "Mot de passe incorrect" }, 401);
    const res = NextResponse.json({ ok: true });
    setMjCookie(req, res);
    return res;
  }
  if (!isMj(req)) return json({ error: "MJ uniquement" }, 401);
  return handle(async () => {
    const database = await db();
    switch (op) {
      case "reset": return E.resetGame(database, { keepPlayers: b.keepPlayers === true }).then(() => ({ ok: true }));
      case "assign-roles": return E.assignRoles(database, { roles: Array.isArray(b.roles) ? b.roles.map(String) : undefined });
      case "set-role": return E.setRole(database, str(b.playerId), str(b.role));
      case "unbind": return E.unbindBadge(database, str(b.playerId));
      case "transfer": return E.transferBadge(database, str(b.playerId), str(b.badge));
      case "launch": return E.launch(database);
      case "pause": return E.setPaused(database, true);
      case "resume": return E.setPaused(database, false);
      case "warp": return E.warp(database, Number(b.seconds));
      case "settings": return E.updateSettings(database, (b.settings as Record<string, unknown>) ?? {});
      case "kill": return E.mjKill(database, str(b.playerId));
      case "revive": return E.mjRevive(database, str(b.playerId));
      case "council": return E.mjConvokeCouncil(database);
      case "council-skip": return E.mjSkipCouncilStage(database);
      case "event": {
        const action = str(b.action);
        if (action !== "shift" && action !== "now" && action !== "cancel") throw new GameError("Action inconnue");
        return E.mjEvent(database, str(b.eventId), action, Number(b.seconds) || 0);
      }
      case "screen": return E.mjScreen(database, b.mode ? { mode: str(b.mode), text: b.text ? str(b.text) : undefined } : null);
      default: throw new GameError("Action inconnue", 404);
    }
  });
}
