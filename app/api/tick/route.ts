import type { NextRequest } from "next/server";
import { db, handle, json } from "@/lib/api";
import { isMj } from "@/lib/auth";
import { tick } from "@/lib/game/engine";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const database = await db();
    if (!(await isMj(database, req))) return json({ error: "MJ uniquement" }, 401);
    return tick(database);
  });
}
