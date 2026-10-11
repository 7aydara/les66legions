import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Db } from "./db";

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

export function playerToken(req: NextRequest): string | undefined {
  return req.cookies.get(PLAYER_COOKIE)?.value;
}

// --- Mot de passe MJ -------------------------------------------------------------------------
// Source : app_config.mj_password_hash (scrypt) si présent, sinon la variable MJ_PASSWORD.
// Le cookie MJ est un condensat de cette source : changer le mot de passe déconnecte le MJ.

export function hashMjPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 32).toString("base64")}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

type Source = { kind: "hash"; value: string } | { kind: "env"; value: string } | null;
const cache: { at: number; source: Source } = { at: 0, source: null };

async function mjSource(db: Db): Promise<Source> {
  if (Date.now() - cache.at < 30_000) return cache.source;
  const [row] = await db.query<{ value: string }>("select value from app_config where key = 'mj_password_hash'");
  const env = process.env.MJ_PASSWORD;
  cache.source = row ? { kind: "hash", value: row.value } : env ? { kind: "env", value: env } : null;
  cache.at = Date.now();
  return cache.source;
}

function digest(source: NonNullable<Source>) {
  return createHash("sha256").update(`l66-mj:${source.kind}:${source.value}`).digest("hex");
}

export async function mjConfigured(db: Db) {
  return (await mjSource(db)) !== null;
}

export async function checkMjPassword(db: Db, password: string): Promise<boolean> {
  cache.at = 0; // à la connexion, toujours relire la source
  const source = await mjSource(db);
  if (!source) return false;
  if (source.kind === "hash") return verifyHash(password, source.value);
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(source.value).digest();
  return timingSafeEqual(a, b);
}

export async function setMjCookie(db: Db, req: NextRequest, res: NextResponse) {
  const source = await mjSource(db);
  if (source) res.cookies.set(MJ_COOKIE, digest(source), { ...cookieBase(req), maxAge: 60 * 60 * 12 });
}

export async function isMj(db: Db, req: NextRequest): Promise<boolean> {
  const source = await mjSource(db);
  const c = req.cookies.get(MJ_COOKIE)?.value;
  if (!source || !c) return false;
  const d = digest(source);
  return c.length === d.length && timingSafeEqual(Buffer.from(c), Buffer.from(d));
}
