import type { NextRequest } from "next/server";
import { db, handle } from "@/lib/api";
import { playerToken } from "@/lib/auth";
import { GameError } from "@/lib/game/errors";
import { playerView } from "@/lib/game/views";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const v = await playerView(await db(), playerToken(req));
    if (!v) throw new GameError("Scanne d'abord ton badge.", 401);
    return v;
  });
}
