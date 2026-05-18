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

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/meta`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Server did not start within 10s");
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
      PORT: port
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });

  await waitForServer();

  const health = await getJson("/api/health");
  assert.equal(health.ok, true);
  assert.equal(health.catalogExists, true);

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
  process.exitCode = 1;
} finally {
  if (server) server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
