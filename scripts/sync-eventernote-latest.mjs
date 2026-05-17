import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { detectType, detectWork, makeTags, slugify } from "./lib/classify.mjs";
import { cleanEventRecord } from "./lib/clean.mjs";

const outPath = "data/generated/eventernote-latest.json";
const baseUrl = "https://www.eventernote.com";
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  return [key, value || "true"];
}));

const days = Number(args.get("days") || 30);
const startDate = args.get("start") || toIsoDate(new Date());
const endDate = args.get("end") || addDays(startDate, days - 1);
const detailLimit = Number(args.get("detail-limit") || 500);
const forceDetail = args.get("force-detail") === "true";

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, count) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return toIsoDate(date);
}

function datesBetween(start, end) {
  const dates = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "eventnote-prototype/0.1 latest-sync"
    }
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

function extractEventLinks(html) {
  return [...html.matchAll(/<h4>\s*<a\s+href="\/events\/(\d+)">([\s\S]*?)<\/a>\s*<\/h4>/g)]
    .map((match) => ({
      sourceEventId: match[1],
      title: decodeHtml(match[2])
    }));
}

function extractPageUrls(html, date) {
  const [year, month, day] = date.split("-").map(Number);
  const pageNumbers = [...html.matchAll(/\/events\/month\/\d{4}-\d{1,2}-\d{1,2}\/(\d+)\?facet=1&limit=30/g)]
    .map((match) => Number(match[1]))
    .filter(Boolean);
  const maxPage = Math.max(1, ...pageNumbers);
  return Array.from({ length: maxPage - 1 }, (_, index) => (
    `${baseUrl}/events/month/${year}-${month}-${day}/${index + 2}?facet=1&limit=30`
  ));
}

function extractTableCell(html, label) {
  const rowPattern = new RegExp(`<tr>[\\s\\S]*?<td[^>]*>\\s*${label}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>\\s*<\\/tr>`, "i");
  return html.match(rowPattern)?.[1] || "";
}

function cleanArtistName(value) {
  const name = decodeHtml(value);
  if (!name || /のイベント$/.test(name)) return "";
  return name;
}

function extractDetail(html, fallback) {
  const title = decodeHtml(html.match(/gb_events_detail_title[\s\S]*?<h2>([\s\S]*?)<\/h2>/)?.[1]) || fallback.title;
  const date = html.match(/\/events\/search\?year=(\d{4})&month=(\d{1,2})&day=(\d{1,2})/) || [];
  const dateString = date.length
    ? `${date[1]}-${String(date[2]).padStart(2, "0")}-${String(date[3]).padStart(2, "0")}`
    : fallback.date;
  const placeBlock = extractTableCell(html, "開催場所");
  const place = placeBlock.match(/<a href="\/places\/(\d+)">([\s\S]*?)<\/a>/);
  const placeId = place?.[1] || "";
  const venue = decodeHtml(place?.[2] || placeBlock || "会场未详");
  const actorBlock = extractTableCell(html, "出演者");
  const actorMatches = [...actorBlock.matchAll(/<a href="\/actors\/[^"]+\/(\d+)">([\s\S]*?)<\/a>/g)];
  const artistRows = actorMatches
    .map((match) => ({
      id: `eventernote-actor-${match[1]}`,
      name: cleanArtistName(match[2])
    }))
    .filter((row) => row.name);
  const seenArtistIds = new Set();
  const uniqueArtists = artistRows.filter((row) => {
    if (seenArtistIds.has(row.id)) return false;
    seenArtistIds.add(row.id);
    return true;
  });
  const artists = uniqueArtists.map((row) => row.name);
  const artistIds = uniqueArtists.map((row) => row.id);
  const type = detectType(title);
  const work = detectWork(title);
  const venueId = placeId ? `eventernote-place-${placeId}` : `eventernote-event-${fallback.sourceEventId}-venue`;

  return cleanEventRecord({
    id: `eventernote-${fallback.sourceEventId}`,
    sourceEventId: fallback.sourceEventId,
    title,
    date: dateString,
    city: "unknown",
    type,
    venueId,
    venue,
    workId: slugify(work),
    work,
    artistIds,
    artists,
    status: "最新同步",
    sourceType: "live-crawl",
    sourceName: "Eventernote 最新同步",
    sourceUrl: `${baseUrl}/events/${fallback.sourceEventId}`,
    verifiedAt: toIsoDate(new Date()),
    tags: makeTags(title, type)
  });
}

function eventFromList(row, date) {
  const type = detectType(row.title);
  const work = detectWork(row.title);
  return cleanEventRecord({
    id: `eventernote-${row.sourceEventId}`,
    sourceEventId: row.sourceEventId,
    title: row.title,
    date,
    city: "unknown",
    type,
    venueId: `eventernote-event-${row.sourceEventId}-venue`,
    venue: "会场未详",
    workId: slugify(work),
    work,
    artistIds: [],
    artists: [],
    status: "最新同步",
    sourceType: "live-crawl",
    sourceName: "Eventernote 最新同步",
    sourceUrl: `${baseUrl}/events/${row.sourceEventId}`,
    verifiedAt: toIsoDate(new Date()),
    tags: makeTags(row.title, type)
  });
}

function hasDetail(event) {
  return Boolean(event?.artists?.length || (event?.venue && event.venue !== "会场未详"));
}

mkdirSync("data/generated", { recursive: true });

const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { events: [] };
const eventsById = new Map((previous.events || []).map((event) => [event.sourceEventId, event]));
let detailCount = 0;

for (const date of datesBetween(startDate, endDate)) {
  const [year, month, day] = date.split("-").map(Number);
  const firstUrl = `${baseUrl}/events/search?year=${year}&month=${month}&day=${day}`;
  const firstHtml = await fetchText(firstUrl);
  const pageUrls = [firstUrl, ...extractPageUrls(firstHtml, date)];
  const uniquePageUrls = [...new Set(pageUrls)];
  const listRows = [];

  for (const url of uniquePageUrls) {
    const html = url === firstUrl ? firstHtml : await fetchText(url);
    listRows.push(...extractEventLinks(html));
  }

  for (const row of listRows) {
    if (!eventsById.has(row.sourceEventId)) {
      eventsById.set(row.sourceEventId, eventFromList(row, date));
    }
    if (detailCount >= detailLimit || (!forceDetail && hasDetail(eventsById.get(row.sourceEventId)))) continue;
    const html = await fetchText(`${baseUrl}/events/${row.sourceEventId}`);
    eventsById.set(row.sourceEventId, extractDetail(html, { ...row, date }));
    detailCount += 1;
  }

  console.log(`${date}: ${listRows.length} events`);
}

const events = [...eventsById.values()]
  .map(cleanEventRecord)
  .sort((a, b) => `${b.date}-${b.sourceEventId}`.localeCompare(`${a.date}-${a.sourceEventId}`));
const eventDates = events.map((event) => event.date).filter(Boolean).sort();
const tmpPath = `${outPath}.tmp`;
writeFileSync(tmpPath, JSON.stringify({
  meta: {
    source: "eventernote-live-crawl",
    sourceUrl: `${baseUrl}/events/`,
    syncedAt: new Date().toISOString(),
    startDate: eventDates[0] || startDate,
    endDate: eventDates[eventDates.length - 1] || endDate,
    lastRun: {
      startDate,
      endDate,
      detailedEvents: detailCount
    },
    events: events.length,
    detailedEvents: detailCount
  },
  events
}, null, 2));
renameSync(tmpPath, outPath);

console.log(`Wrote ${events.length} latest events (${detailCount} detailed this run) -> ${outPath}`);
