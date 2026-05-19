import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasEventExtra, parseEventExtraHtml } from "./lib/event-extra.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  return [key, value || "true"];
}));

const startDate = args.get("start-date") || "2020-01-01";
const endDate = args.get("end-date") || "9999-12-31";
const limit = Number(args.get("limit") || 0);
const force = args.get("force") === "true";
const delayMs = Number(args.get("delay-ms") || 250);
const outPath = args.get("out") || "data/generated/event-extras.json";
const catalogPath = "data/generated/eventernote-catalog.json";
const latestPath = "data/generated/eventernote-latest.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "eventnote-prototype/0.1 event-extra-sync" }
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

function loadEvents() {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const latest = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, "utf8")) : { events: [] };
  const rows = new Map();
  for (const event of catalog.events || []) {
    if (event.sourceEventId) rows.set(event.sourceEventId, event);
  }
  for (const event of latest.events || []) {
    if (event.sourceEventId) rows.set(event.sourceEventId, event);
  }
  return [...rows.values()]
    .filter((event) => event.sourceEventId && event.sourceUrl && event.date >= startDate && event.date <= endDate)
    .sort((a, b) => `${b.date}-${b.sourceEventId}`.localeCompare(`${a.date}-${a.sourceEventId}`));
}

function loadStore() {
  if (!existsSync(outPath)) {
    return {
      meta: { source: "eventernote-detail-pages", syncedAt: "", startDate, endDate, crawled: 0, hits: 0 },
      events: {}
    };
  }
  const parsed = JSON.parse(readFileSync(outPath, "utf8"));
  return {
    meta: parsed.meta || {},
    events: parsed.events && typeof parsed.events === "object" ? parsed.events : {}
  };
}

function writeStore(store) {
  mkdirSync(join(outPath, ".."), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(tmpPath, outPath);
}

const events = loadEvents();
const store = loadStore();
const pending = events.filter((event) => force || !store.events[event.sourceEventId]);
const targets = limit > 0 ? pending.slice(0, limit) : pending;
let crawled = 0;
let hits = 0;
let failed = 0;

console.log(`Event extras sync: ${events.length} events since ${startDate}, ${pending.length} pending, ${targets.length} this run.`);

for (const event of targets) {
  try {
    const html = await fetchText(event.sourceUrl);
    const extra = parseEventExtraHtml(html);
    store.events[event.sourceEventId] = {
      ...extra,
      sourceEventId: event.sourceEventId,
      eventDate: event.date,
      sourceUrl: event.sourceUrl,
      updatedAt: new Date().toISOString()
    };
    if (hasEventExtra(extra)) hits += 1;
  } catch (error) {
    failed += 1;
    store.events[event.sourceEventId] = {
      sourceEventId: event.sourceEventId,
      eventDate: event.date,
      sourceUrl: event.sourceUrl,
      error: error?.message || String(error),
      updatedAt: new Date().toISOString()
    };
  }
  crawled += 1;
  if (crawled % 25 === 0) {
    store.meta = {
      source: "eventernote-detail-pages",
      syncedAt: new Date().toISOString(),
      startDate,
      endDate,
      totalCandidates: events.length,
      stored: Object.keys(store.events).length,
      lastRun: { crawled, hits, failed, limit }
    };
    writeStore(store);
    console.log(`  ${crawled}/${targets.length} crawled, ${hits} with extras, ${failed} failed`);
  }
  if (delayMs > 0) await sleep(delayMs);
}

store.meta = {
  source: "eventernote-detail-pages",
  syncedAt: new Date().toISOString(),
  startDate,
  endDate,
  totalCandidates: events.length,
  stored: Object.keys(store.events).length,
  lastRun: { crawled, hits, failed, limit }
};
writeStore(store);

console.log(`Done. Crawled ${crawled}, found extras ${hits}, failed ${failed}. Wrote ${outPath}`);
