import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const PLAYER_COOKIE = "l66_token";
export const MJ_COOKIE = "l66_mj";

// Secure seulement en HTTPS : permet une répétition en Wi-Fi local (http://192.168…).
const cookieBase = (req: NextRequest) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: req.nextUrl.protocol === "https:",
  path: "/",
});

export function setPlayerCookie(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(PLAYER_COOKIE, token, { ...cookieBase(req), maxAge: 60 * 60 * 24 });
}

function mjDigest(): string | null {
  const pwd = process.env.MJ_PASSWORD;
  if (!pwd) return null;
  return createHash("sha256").update(`l66-mj:${pwd}`).digest("hex");
}

export function checkMjPassword(password: string): boolean {
  const pwd = process.env.MJ_PASSWORD;
  if (!pwd) return false;
  const a = Buffer.from(createHash("sha256").update(password).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(pwd).digest("hex"));
  return timingSafeEqual(a, b);
}

export function setMjCookie(req: NextRequest, res: NextResponse) {
  res.cookies.set(MJ_COOKIE, mjDigest()!, { ...cookieBase(req), maxAge: 60 * 60 * 12 });
}

export function isMj(req: NextRequest): boolean {
  const d = mjDigest();
  const c = req.cookies.get(MJ_COOKIE)?.value;
  if (!d || !c || c.length !== d.length) return false;
  return timingSafeEqual(Buffer.from(c), Buffer.from(d));
}

export function playerToken(req: NextRequest): string | undefined {
  return req.cookies.get(PLAYER_COOKIE)?.value;
}
