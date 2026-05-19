import { existsSync, readFileSync, writeFileSync } from "node:fs";

const catalogPath = "data/generated/eventernote-catalog.json";
const latestPath = "data/generated/eventernote-latest.json";
const outPath = "data/generated/event-venue-overrides.json";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);

const mode = args.get("mode") || "unknown";
const limit = Number(args.get("limit") || 500);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const latest = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, "utf8")) : { events: [] };
const eventsById = new Map((catalog.events || []).map((event) => [String(event.sourceEventId), event]));
for (const event of latest.events || []) {
  if (event?.sourceEventId) eventsById.set(String(event.sourceEventId), event);
}
const existingRows = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
const existingByEventId = new Map(existingRows.map((row) => [row.sourceEventId, row]));

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value = "") {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanVenueName(value = "") {
  return stripTags(value)
    .split(/\n/)[0]
    .replace(/^(会場|場所|開催場所)\s*[：:▷▶]\s*/, "")
    .replace(/\s*(予約|時間|開場|開演|出演|料金|住所)\s*[：:▷▶].*$/s, "")
    .replace(/^[　\s]+|[　\s]+$/g, "")
    .trim();
}

function isUsefulVenue(value = "") {
  if (!value) return false;
  if (/^(未定|未詳|TBA|調整中|なし)$/i.test(value)) return false;
  if (/(当選|購入者|メール|ご案内|ご連絡|通知|あなたのいる場所|某|予定|未定|アクセス|アクセスの良いところ|どこか|どちらか)/.test(value)) return false;
  if (/^〒/.test(value)) return false;
  if (value.length > 80) return false;
  return true;
}

function extractVenue(html) {
  const placeLink = html.match(/<a\s+href="\/places\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (placeLink) {
    const name = cleanVenueName(placeLink[2]);
    if (isUsefulVenue(name)) {
      return {
        name,
        venueId: `eventernote-place-${placeLink[1]}`,
        confidence: "event-page-place-link"
      };
    }
  }

  const placeRow = html.match(/<td[^>]*>\s*開催場所\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (placeRow) {
    const name = cleanVenueName(placeRow[1]);
    if (isUsefulVenue(name)) {
      return {
        name,
        venueId: "",
        confidence: "event-page-place-row"
      };
    }
  }

  const text = stripTags(html);
  const line = text
    .split("\n")
    .map((value) => value.trim())
    .find((value) => /^(会場|場所|開催場所)\s*[：:▷▶]/.test(value));
  const name = cleanVenueName(line || "");
  if (isUsefulVenue(name)) {
    return {
      name,
      venueId: "",
      confidence: "event-page-description"
    };
  }

  return null;
}

function shouldFetch(event) {
  if (existingByEventId.get(event.sourceEventId)?.name) return false;
  const missingVenueId = !event.venueId || event.venueId === "eventernote-place-unknown";
  const missingVenueName = !event.venue || event.venue === "会场名待补全" || event.venue === "会场未详";
  if (mode === "unknown") return missingVenueId;
  if (mode === "missing") return missingVenueName;
  return missingVenueId || missingVenueName;
}

async function fetchEventVenue(event) {
  const url = `https://www.eventernote.com/events/${event.sourceEventId}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "eventnote-prototype/0.1 event-venue-cache"
    }
  });

  if (!response.ok) {
    return {
      sourceEventId: event.sourceEventId,
      name: "",
      venueId: "",
      sourceUrl: url,
      confidence: "event-page-http-error",
      ok: false
    };
  }

  const venue = extractVenue(await response.text());
  return {
    sourceEventId: event.sourceEventId,
    name: venue?.name || "",
    venueId: venue?.venueId || "",
    sourceUrl: url,
    confidence: venue?.confidence || "event-page-unresolved",
    ok: Boolean(venue?.name)
  };
}

const targets = [...eventsById.values()]
  .filter(shouldFetch)
  .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.sourceEventId || 0) - Number(a.sourceEventId || 0))
  .slice(0, limit);
const rows = [];
for (const [index, event] of targets.entries()) {
  const row = await fetchEventVenue(event);
  rows.push(row);
  console.log(`${index + 1}/${targets.length} ${event.sourceEventId} ${row.name || "unresolved"} (${row.confidence})`);
  await new Promise((resolve) => setTimeout(resolve, 180));
}

const merged = new Map(existingRows.map((row) => [row.sourceEventId, row]));
for (const row of rows) merged.set(row.sourceEventId, row);

const nextRows = [...merged.values()].sort((a, b) => Number(b.sourceEventId) - Number(a.sourceEventId));
writeFileSync(outPath, JSON.stringify(nextRows, null, 2));
console.log(`Fetched ${rows.length} event venue records; cache now has ${nextRows.length} records -> ${outPath}`);
