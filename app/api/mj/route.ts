import type { NextRequest } from "next/server";
import { db, handle, json } from "@/lib/api";
import { isMj } from "@/lib/auth";
import { mjView } from "@/lib/game/views";

export async function GET(req: NextRequest) {
  if (!isMj(req)) return json({ error: "MJ uniquement" }, 401);
  return handle(async () => mjView(await db()));
}
