import { db, handle } from "@/lib/api";
import { screenView } from "@/lib/game/views";

export async function GET() {
  return handle(async () => screenView(await db()));
}
