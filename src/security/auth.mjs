import { randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "everything_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function readCookieHeader(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && value) cookies.set(key, value);
  }
  return cookies;
}

export function createAuthManager({ password = "", cookieSecure = false, now = () => Date.now(), tokenFactory = () => randomBytes(32).toString("hex") } = {}) {
  const sessions = new Map();
  const enabled = Boolean(password);

  function verifyPassword(candidate) {
    if (!enabled || typeof candidate !== "string") return false;
    const expected = Buffer.from(password, "utf8");
    const supplied = Buffer.from(candidate, "utf8");
    if (expected.length !== supplied.length || expected.length === 0) return false;
    return timingSafeEqual(expected, supplied);
  }

  function getToken(req) {
    const token = readCookieHeader(req.headers.cookie || "").get(SESSION_COOKIE);
    return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
  }

  function isAuthenticated(req) {
    const token = getToken(req);
    if (!token) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt || expiresAt <= now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function createSession() {
    const token = tokenFactory();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Session token factory returned an invalid token");
    sessions.set(token, now() + SESSION_TTL_MS);
    return token;
  }

  function destroySession(req) {
    const token = getToken(req);
    if (token) sessions.delete(token);
  }

  function cookie(token) {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${cookieSecure ? "; Secure" : ""}`;
  }

  function clearCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecure ? "; Secure" : ""}`;
  }

  return { enabled, verifyPassword, isAuthenticated, createSession, destroySession, cookie, clearCookie };
}
