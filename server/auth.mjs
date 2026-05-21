import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { promisify } from "node:util";
import { createLocalDb } from "./local-db.mjs";

const scryptAsync = promisify(scrypt);
const sessionCookie = "otakuevents_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const usernamePattern = /^[a-zA-Z0-9_.-]{3,32}$/;

export function createAuth({ dataRoot }) {
  const localDir = join(dataRoot, "local");
  const secretPath = join(localDir, "auth-secret");
  const localDb = createLocalDb({ dataRoot });
  mkdirSync(localDir, { recursive: true });

  const secret = loadOrCreateSecret(secretPath);

  async function handleAuthApi(request, response, pathname) {
    if (pathname === "/api/auth/session" && request.method === "GET") {
      sendAuthJson(response, { user: getCurrentUser(request) });
      return true;
    }

    if (pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJsonBody(request);
      const username = normalizeUsername(body.username);
      const displayName = String(body.displayName || username).trim().slice(0, 40);
      const password = String(body.password || "");

      if (!usernamePattern.test(username)) {
        sendAuthJson(response, { error: "用户名需为 3-32 位字母、数字、下划线、横线或点。" }, 400);
        return true;
      }
      if (password.length < 8) {
        sendAuthJson(response, { error: "密码至少需要 8 位。" }, 400);
        return true;
      }

      if (localDb.findUserByUsername(username)) {
        sendAuthJson(response, { error: "这个用户名已经被注册。" }, 409);
        return true;
      }

      const user = {
        id: `user-${randomBytes(10).toString("hex")}`,
        username,
        displayName: displayName || username,
        password: await hashPassword(password),
        createdAt: new Date().toISOString()
      };
      localDb.insertUser(user);
      setSessionCookie(response, signSession(user), request);
      sendAuthJson(response, { user: publicUser(user) }, 201);
      return true;
    }

    if (pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      const user = localDb.findUserByUsername(username);

      if (!user || !(await verifyPassword(password, user.password))) {
        sendAuthJson(response, { error: "用户名或密码不正确。" }, 401);
        return true;
      }

      setSessionCookie(response, signSession(user), request);
      sendAuthJson(response, { user: publicUser(user) });
      return true;
    }

    if (pathname === "/api/auth/logout" && request.method === "POST") {
      clearSessionCookie(response, request);
      sendAuthJson(response, { ok: true });
      return true;
    }

    return false;
  }

  function getCurrentUser(request) {
    const token = parseCookies(request.headers.cookie || "")[sessionCookie];
    if (!token) return null;

    const payload = verifySession(token);
    if (!payload || payload.exp < Date.now()) return null;

    const user = localDb.findUserById(payload.userId);
    return user ? publicUser(user) : null;
  }

  function signSession(user) {
    const payload = {
      userId: user.id,
      exp: Date.now() + sessionMaxAgeSeconds * 1000
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  function verifySession(token) {
    const [encoded, signature] = String(token || "").split(".");
    if (!encoded || !signature) return null;
    const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
    if (!safeEqual(signature, expected)) return null;
    try {
      return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  return {
    getCurrentUser,
    handleAuthApi
  };
}

function loadOrCreateSecret(secretPath) {
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf8").trim();
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = await scryptAsync(password, salt, 64);
  return {
    algorithm: "scrypt",
    salt,
    hash: Buffer.from(hash).toString("base64url")
  };
}

async function verifyPassword(password, stored) {
  if (!stored || stored.algorithm !== "scrypt" || !stored.salt || !stored.hash) return false;
  const hash = await scryptAsync(password, stored.salt, 64);
  return safeEqual(Buffer.from(hash).toString("base64url"), stored.hash);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    isAdmin: isAdminUser(user)
  };
}

function adminUsernames() {
  return new Set(["admin", ...String(process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)]);
}

function isAdminUser(user) {
  return adminUsernames().has(String(user?.username || "").toLowerCase());
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") || "")];
  }).filter(([key]) => key));
}

function setSessionCookie(response, token, request) {
  response.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; SameSite=Lax${isSecureRequest(request) ? "; Secure" : ""}`);
}

function clearSessionCookie(response, request) {
  response.setHeader("Set-Cookie", `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecureRequest(request) ? "; Secure" : ""}`);
}

function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https" || process.env.AUTH_COOKIE_SECURE === "1";
}

function sendAuthJson(response, payload, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}
