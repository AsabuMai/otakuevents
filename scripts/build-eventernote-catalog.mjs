import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { detectType, detectWork, makeTags, slugify } from "./lib/classify.mjs";
import { cleanEventRecord, isConcreteVenueName, isMeaningfulWorkTitle } from "./lib/clean.mjs";

const rawPath = "data/raw/eventernote-events.json";
const outPath = "data/generated/eventernote-catalog.json";
const venueCachePath = "data/generated/venue-names.json";
const eventVenueOverridesPath = "data/generated/event-venue-overrides.json";
const venueManualOverridesPath = "data/generated/venue-manual-overrides.json";

function normalizeJson(text) {
  return text.replace(/:\s*NaN/g, ": null");
}

function isUsefulEventVenueOverride(row) {
  if (!row?.ok || !row.name) return false;
  if (/^(未定|未詳|TBA|調整中|なし)$/i.test(row.name)) return false;
  if (/(当選|購入者|メール|ご案内|ご連絡|通知|あなたのいる場所|某|予定|未定|アクセス$)/.test(row.name)) return false;
  if (/^〒/.test(row.name)) return false;
  if (row.name.length > 80) return false;
  return true;
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

mkdirSync("data/generated", { recursive: true });

const venueNameCache = JSON.parse(readFileSync(venueCachePath, "utf8"));
const venueManualOverrides = existsSync(venueManualOverridesPath)
  ? JSON.parse(readFileSync(venueManualOverridesPath, "utf8"))
  : [];
const venueNamesById = new Map(venueNameCache.map((venue) => [venue.id, venue]));
for (const venue of venueManualOverrides) {
  venueNamesById.set(venue.id, { ...venue, ok: true, manual: true });
}
const eventVenueOverrides = existsSync(eventVenueOverridesPath)
  ? JSON.parse(readFileSync(eventVenueOverridesPath, "utf8")).filter(isUsefulEventVenueOverride)
  : [];
const eventVenueOverridesByEventId = new Map(eventVenueOverrides.map((row) => [row.sourceEventId, row]));
const eventVenueOverridesByVenueId = new Map();
for (const row of eventVenueOverrides) {
  if (row.venueId) eventVenueOverridesByVenueId.set(row.venueId, row);
  eventVenueOverridesByVenueId.set(`eventernote-event-${row.sourceEventId}-venue`, row);
}
const source = JSON.parse(normalizeJson(readFileSync(rawPath, "utf8")));
const nodeData = source["node-data"];
const edgeData = source["edge-data"];
const edgeDict = source["edge-dict"];

const artistCounts = new Map();
const firstArtistIdByName = new Map();
const workCounts = new Map();
const venueCounts = new Map();

const events = Object.entries(edgeData)
  .map(([id, event]) => {
    const title = String(event.event_name || "").trim();
    const type = detectType(title);
    const work = detectWork(title);
    const placeId = event.place_id == null ? "unknown" : String(event.place_id);
    const venueId = placeId === "unknown" ? "eventernote-place-unknown" : `eventernote-place-${placeId}`;
    const actorIds = edgeDict[id] || [];
    const artists = actorIds.map((actorId) => nodeData[actorId]?.name?.trim()).filter(Boolean);
    const eventVenueOverride = eventVenueOverridesByEventId.get(id);
    const resolvedVenueId = eventVenueOverride?.venueId || (eventVenueOverride ? `eventernote-event-${id}-venue` : venueId);
    const venue = eventVenueOverride?.name || venueNamesById.get(venueId)?.name || (placeId === "unknown" ? "会场未详" : "会场名待补全");

    const rawEvent = {
      id: `eventernote-${id}`,
      sourceEventId: id,
      title,
      date: event.event_date || "",
      city: "unknown",
      type,
      venueId: resolvedVenueId,
      venue,
      workId: slugify(work),
      work,
      artistIds: actorIds.map((actorId) => `eventernote-actor-${actorId}`),
      artists,
      status: "历史档案",
      sourceType: "community",
      sourceName: "Eventernote 历史数据集",
      sourceUrl: `https://www.eventernote.com/events/${id}`,
      verifiedAt: "2024-05-23",
      tags: makeTags(title, type)
    };
    const cleanEvent = cleanEventRecord(rawEvent);

    cleanEvent.artists.forEach((name, index) => {
      artistCounts.set(name, (artistCounts.get(name) || 0) + 1);
      if (!firstArtistIdByName.has(name)) firstArtistIdByName.set(name, cleanEvent.artistIds[index]);
    });
    if (isMeaningfulWorkTitle(cleanEvent.work)) workCounts.set(cleanEvent.work, (workCounts.get(cleanEvent.work) || 0) + 1);
    if (cleanEvent.venueId && isConcreteVenueName(cleanEvent.venue)) {
      venueCounts.set(cleanEvent.venueId, (venueCounts.get(cleanEvent.venueId) || 0) + 1);
    }

    return cleanEvent;
  })
  .filter((event) => event.title && event.date)
  .sort((a, b) => `${b.date}-${b.sourceEventId}`.localeCompare(`${a.date}-${a.sourceEventId}`));

const eventsByArtist = new Map();
for (const event of events) {
  for (const artist of event.artists) {
    if (!eventsByArtist.has(artist)) eventsByArtist.set(artist, event.id);
  }
}

const artists = topEntries(artistCounts, artistCounts.size).map(([name, count]) => ({
  id: firstArtistIdByName.get(name) || `eventernote-actor-${slugify(name)}`,
  name,
  role: "Eventernote 出演者",
  follows: count,
  nextEventId: eventsByArtist.get(name) || ""
}));

const works = topEntries(workCounts, workCounts.size).map(([title, count]) => ({
  id: slugify(title),
  title,
  category: "作品/企划",
  trend: `Eventernote 历史档案中 ${count.toLocaleString("ja-JP")} 场`,
  events: count
}));

const venues = topEntries(venueCounts, venueCounts.size).map(([id, count]) => {
  const cached = venueNamesById.get(id);
  const eventOverride = eventVenueOverridesByVenueId.get(id);
  return {
    id,
    name: cached?.name || eventOverride?.name || (id.startsWith("eventernote-event-") ? "Eventernote 活动页补全" : id === "eventernote-place-unknown" ? "会场未详" : "会场名待补全"),
    area: cached?.area || (eventOverride ? "Eventernote 活动页" : "Eventernote place_id"),
    capacity: "未补全",
    events: count,
    sourceUrl: cached?.sourceUrl || eventOverride?.sourceUrl || (id === "eventernote-place-unknown" ? "https://www.eventernote.com/" : `https://www.eventernote.com/places/${id.replace("eventernote-place-", "")}`)
  };
});

const catalog = {
  meta: {
    source: "eventernote-events",
    doi: "10.5281/zenodo.11151063",
    sourceUrl: "https://zenodo.org/records/11151063",
    generatedAt: new Date().toISOString(),
    rawEvents: Object.keys(edgeData).length,
    rawActors: Object.keys(nodeData).length,
    events: events.length,
    artists: artists.length,
    works: works.length,
    venues: venues.length,
    note: "Full Eventernote historical data is stored server-side. Frontend uses paginated API responses."
  },
  events,
  artists,
  works,
  venues
};

writeFileSync(outPath, JSON.stringify(catalog));
console.log(`Wrote ${events.length} events, ${artists.length} artists, ${works.length} works, ${venues.length} venues -> ${outPath}`);
