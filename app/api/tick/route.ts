import type { NextRequest } from "next/server";
import { db, handle, json } from "@/lib/api";
import { isMj } from "@/lib/auth";
import { tick } from "@/lib/game/engine";

export async function POST(req: NextRequest) {
  if (!isMj(req)) return json({ error: "MJ uniquement" }, 401);
  return handle(async () => tick(await db()));
}
