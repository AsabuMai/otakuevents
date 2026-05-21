import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "eventnote-api-"));
const generatedDir = join(dataDir, "generated");
const port = String(5300 + Math.floor(Math.random() * 1000));
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverOutput = "";
let serverExitStatus = null;

const catalog = {
  meta: {
    source: "eventnote-smoke",
    doi: "local-smoke",
    sourceUrl: "",
    generatedAt: new Date(0).toISOString(),
    rawEvents: 2,
    rawActors: 2,
    events: 2,
    artists: 2,
    works: 1,
    venues: 1,
    note: "Small fixture for API smoke tests."
  },
  events: [
    {
      id: "eventernote-1",
      sourceEventId: "1",
      title: "ラブライブ！ Sample Live",
      date: "2026-05-16",
      city: "東京都",
      type: "live",
      venueId: "eventernote-place-1",
      venue: "東京ドーム",
      workId: "lovelive",
      work: "LoveLive!",
      artistIds: ["eventernote-actor-1"],
      artists: ["水瀬いのり"],
      status: "fixture",
      sourceType: "fixture",
      sourceName: "Smoke fixture",
      sourceUrl: "https://www.eventernote.com/events/1",
      verifiedAt: "2026-05-16",
      tags: ["Live"]
    },
    {
      id: "eventernote-2",
      sourceEventId: "2",
      title: "声優ラジオ Sample Talk",
      date: "2026-05-17",
      city: "大阪府",
      type: "talk",
      venueId: "eventernote-place-2",
      venue: "大阪ホール",
      workId: "seiyu-radio",
      work: "声優ラジオ",
      artistIds: ["eventernote-actor-2"],
      artists: ["雨宮天"],
      status: "fixture",
      sourceType: "fixture",
      sourceName: "Smoke fixture",
      sourceUrl: "https://www.eventernote.com/events/2",
      verifiedAt: "2026-05-16",
      tags: ["Talk"]
    }
  ],
  artists: [],
  works: [],
  venues: [
    {
      id: "eventernote-place-1",
      name: "東京ドーム",
      area: "東京都の会場一覧",
      capacity: "未补全",
      events: 1,
      sourceUrl: "https://www.eventernote.com/places/1"
    },
    {
      id: "eventernote-place-2",
      name: "大阪ホール",
      area: "大阪府の会場一覧",
      capacity: "未补全",
      events: 1,
      sourceUrl: "https://www.eventernote.com/places/2"
    }
  ]
};

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function getJsonWithCookie(path, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
  const data = await response.json();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function postJson(path, payload, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return {
    cookie: response.headers.get("set-cookie") || cookie,
    data
  };
}

async function postJsonExpect(path, payload, expectedStatus, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, `${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (serverExitStatus) {
      throw new Error(`Server exited before startup (${serverExitStatus}).\n${serverOutput.trim()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not start within 10s.\n${serverOutput.trim()}`);
}

try {
  await mkdir(generatedDir, { recursive: true });
  await writeFile(join(generatedDir, "eventernote-catalog.json"), JSON.stringify(catalog), "utf8");

  server = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      EVENTNOTE_DATA_DIR: dataDir,
      HOST: "127.0.0.1",
      PORT: port,
      ADMIN_USERNAMES: "admin_user"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.on("exit", (code, signal) => {
    serverExitStatus = signal ? `signal ${signal}` : `code ${code}`;
  });

  await waitForServer();

  const health = await getJson("/api/health");
  assert.equal(health.ok, true);
  assert.equal(health.catalogExists, true);

  const register = await postJson("/api/auth/register", {
    username: "sample_user",
    displayName: "Sample User",
    password: "correct-horse"
  });
  assert.equal(register.data.user.username, "sample_user");

  const session = await fetch(`${baseUrl}/api/auth/session`, {
    headers: {
      Cookie: register.cookie
    }
  });
  const sessionPayload = await session.json();
  assert.equal(sessionPayload.user.displayName, "Sample User");
  assert.equal(sessionPayload.user.isAdmin, false);

  const profile = await postJson("/api/profile", {
    displayName: "Sample Public",
    homeArea: "東京",
    favoriteType: "live",
    bio: "Public profile smoke test.",
    links: "X https://x.com/sample",
    contacts: "Discord | sample#0001",
    tags: "ライブ,声優",
    visibility: {
      enabled: true,
      links: true,
      contacts: true,
      interests: true,
      follows: true,
      stats: true
    }
  }, register.cookie);
  assert.equal(profile.data.profile.displayName, "Sample Public");

  const publicProfile = await getJson("/api/users/sample_user");
  assert.equal(publicProfile.user.displayName, "Sample Public");
  assert.equal(publicProfile.profile.contacts, "Discord | sample#0001");

  const question = await postJson("/api/event-question", {
    sourceEventId: "1",
    body: "開場時間はありますか？"
  }, register.cookie);
  assert.equal(question.data.questions.length, 1);
  assert.equal(question.data.questions[0].body, "開場時間はありますか？");

  const answer = await postJson("/api/event-answer", {
    questionId: question.data.questions[0].id,
    body: "公式発表待ちです。"
  }, register.cookie);
  assert.equal(answer.data.questions[0].answers.length, 1);

  const correction = await postJson("/api/event-correction", {
    sourceEventId: "1",
    field: "venue",
    value: "東京ドーム シティ",
    note: "fixture correction",
    sourceUrl: "https://example.com/source"
  }, register.cookie);
  assert.equal(correction.data.corrections.length, 1);
  assert.equal(correction.data.corrections[0].status, "pending");
  assert.equal(correction.data.corrections[0].confirmationCount, 1);

  const confirmCorrection = await postJson("/api/event-correction-confirm", {
    id: correction.data.corrections[0].id
  }, register.cookie);
  assert.equal(confirmCorrection.data.corrections[0].confirmationCount, 1);

  const admin = await postJson("/api/auth/register", {
    username: "admin_user",
    displayName: "Admin User",
    password: "correct-horse-admin"
  });
  assert.equal(admin.data.user.isAdmin, true);

  const moderation = await getJsonWithCookie("/api/admin/moderation", admin.cookie);
  assert.equal(moderation.pendingCorrections.length, 1);
  assert.equal(moderation.recentQuestions.length, 1);

  await postJsonExpect("/api/admin/correction-review", {
    id: correction.data.corrections[0].id,
    status: "confirmed"
  }, 403, register.cookie);

  const reviewed = await postJson("/api/admin/correction-review", {
    id: correction.data.corrections[0].id,
    status: "confirmed"
  }, admin.cookie);
  assert.equal(reviewed.data.pendingCorrections.length, 0);

  const interactions = await getJsonWithCookie("/api/event-interactions?sourceEventId=1", admin.cookie);
  assert.equal(interactions.currentUser.isAdmin, true);
  assert.equal(interactions.corrections[0].status, "confirmed");

  const logout = await postJson("/api/auth/logout", {}, register.cookie);
  assert.equal(logout.data.ok, true);

  const meta = await getJson("/api/meta");
  assert.equal(meta.events, 2);
  assert.equal(meta.frontendMode, "paginated-api");

  const calendar = await getJson("/api/calendar?month=2026-05&date=2026-05-16");
  assert.equal(calendar.total, 2);
  assert.equal(calendar.selectedTotal, 1);
  assert.equal(calendar.selectedItems[0].sourceEventId, "1");

  const events = await getJson("/api/events?q=%E6%B0%B4%E7%80%AC&limit=5");
  assert.equal(events.total, 1);
  assert.equal(events.items[0].title, "ラブライブ！ Sample Live");

  const event = await getJson("/api/event?sourceEventId=1");
  assert.equal(event.item.venue, "東京ドーム");

  const suggestions = await getJson("/api/suggest?q=%E6%B0%B4&scope=events");
  assert.deepEqual(suggestions.items, ["水瀬いのり"]);

  console.log("API smoke test passed");
} catch (error) {
  console.error(error);
  if (serverOutput.trim()) console.error(serverOutput.trim());
  process.exitCode = 1;
} finally {
  if (server) server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
