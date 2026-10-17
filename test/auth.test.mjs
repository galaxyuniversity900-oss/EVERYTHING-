import test from "node:test";
import assert from "node:assert/strict";
import { createAuthManager } from "../src/security/auth.mjs";

test("shared password can be checked without exposing the configured value", () => {
  const auth = createAuthManager({ password: "long-test-password" });
  assert.equal(auth.enabled, true);
  assert.equal(auth.verifyPassword("long-test-password"), true);
  assert.equal(auth.verifyPassword("wrong"), false);
  assert.equal(auth.verifyPassword(undefined), false);
});

test("sessions require a valid token cookie and expire", () => {
  let now = 1_000;
  const auth = createAuthManager({ password: "password", now: () => now, tokenFactory: () => "a".repeat(64) });
  const token = auth.createSession();
  const req = { headers: { cookie: `other=value; everything_session=${token}` } };
  assert.equal(auth.isAuthenticated(req), true);
  auth.destroySession(req);
  assert.equal(auth.isAuthenticated(req), false);
  auth.createSession();
  now += 13 * 60 * 60 * 1000;
  assert.equal(auth.isAuthenticated(req), false);
});

test("session cookies are HttpOnly, SameSite strict, and optionally Secure", () => {
  const auth = createAuthManager({ password: "password", cookieSecure: true, tokenFactory: () => "b".repeat(64) });
  const token = auth.createSession();
  const cookie = auth.cookie(token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(auth.clearCookie(), /Max-Age=0/);
});
