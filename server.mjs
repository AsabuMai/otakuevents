import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, resolve } from "node:path";
import {
  cleanEventRecord,
  isConcreteVenueName,
  isMeaningfulWorkTitle,
  normalizeLocationArea,
  normalizeVenueName
} from "./scripts/lib/clean.mjs";
import { detectWork, slugify, workRules } from "./scripts/lib/classify.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";
const dataRoot = process.env.EVENTNOTE_DATA_DIR
  ? isAbsolute(process.env.EVENTNOTE_DATA_DIR)
    ? process.env.EVENTNOTE_DATA_DIR
    : resolve(root, process.env.EVENTNOTE_DATA_DIR)
  : join(root, "data");
const catalogPath = join(dataRoot, "generated/eventernote-catalog.json");
const latestPath = join(dataRoot, "generated/eventernote-latest.json");
let catalogCache;

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function normalizeCatalogWorks(catalog) {
  return {
    ...catalog,
    events: catalog.events.map(cleanEventRecord)
  };
}

function searchableEventText(event) {
  return `${event.title} ${event.work} ${event.venue} ${(event.artists || []).join(" ")}`.toLowerCase();
}

function mergeLatestCatalog(catalog) {
  if (!existsSync(latestPath)) return catalog;
  const latest = JSON.parse(readFileSync(latestPath, "utf8"));
  const eventRows = new Map(catalog.events.map((event) => [event.sourceEventId, event]));
  for (const event of latest.events || []) {
    if (event?.sourceEventId) eventRows.set(event.sourceEventId, event);
  }
  return {
    ...catalog,
    meta: {
      ...catalog.meta,
      latestSync: latest.meta || null
    },
    events: [...eventRows.values()]
  };
}

function rebuildDirectories(catalog) {
  const artistCounts = new Map();
  const firstArtistIdByName = new Map();
  const firstEventByArtist = new Map();
  const workCounts = new Map();
  const venueCounts = new Map();
  const venueMetaById = new Map(catalog.venues.map((venue) => [venue.id, venue]));

  for (const event of catalog.events) {
    for (const [index, artist] of (event.artists || []).entries()) {
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      if (!firstArtistIdByName.has(artist)) firstArtistIdByName.set(artist, event.artistIds?.[index] || `eventernote-actor-${slugify(artist)}`);
      if (!firstEventByArtist.has(artist)) firstEventByArtist.set(artist, event.id);
    }
    if (isMeaningfulWorkTitle(event.work)) workCounts.set(event.work, (workCounts.get(event.work) || 0) + 1);
    if (event.venueId && isConcreteVenueName(event.venue)) {
      venueCounts.set(event.venueId, (venueCounts.get(event.venueId) || 0) + 1);
      if (!venueMetaById.has(event.venueId)) {
        venueMetaById.set(event.venueId, {
          id: event.venueId,
          name: event.venue,
          area: event.city && event.city !== "unknown" ? event.city : "Eventernote 最新同步",
          capacity: "未补全",
          events: 0,
          sourceUrl: event.sourceUrl
        });
      }
    }
  }

  const artists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      id: firstArtistIdByName.get(name) || `eventernote-actor-${slugify(name)}`,
      name,
      role: "Eventernote 出演者",
      follows: count,
      nextEventId: firstEventByArtist.get(name) || ""
    }));
  const works = [...workCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([title, count]) => ({
      id: slugify(title),
      title,
      category: "作品/企划",
      trend: `Eventernote 档案中 ${count.toLocaleString("ja-JP")} 场`,
      events: count
    }));
  const venues = [...venueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      ...(venueMetaById.get(id) || { id, name: "会场未详", area: "unknown", capacity: "未补全" }),
      events: count
    }));

  return {
    ...catalog,
    meta: {
      ...catalog.meta,
      events: catalog.events.length,
      artists: artists.length,
      works: works.length,
      venues: venues.length
    },
    artists,
    works,
    venues
  };
}

function sanitizeCatalog(catalog) {
  const venues = catalog.venues.map((venue) => ({
    ...venue,
    name: normalizeVenueName(venue.name)
  }));
  const venueAreaById = new Map(venues.map((venue) => [venue.id, normalizeLocationArea(venue.area)]));
  const events = catalog.events.map((event) => ({
    ...event,
    city: venueAreaById.get(event.venueId) || event.city || "unknown",
    venue: normalizeVenueName(event.venue)
  }));
  const locationCounts = new Map();
  for (const event of events) {
    if (!event.city || event.city === "unknown") continue;
    locationCounts.set(event.city, (locationCounts.get(event.city) || 0) + 1);
  }
  const locationOptions = [...locationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, label: value, count }));

  return {
    ...catalog,
    meta: {
      ...catalog.meta,
      locationOptions
    },
    events,
    works: catalog.works,
    venues
  };
}

function buildIndexes(catalog) {
  const eventsBySourceId = new Map();
  const eventsById = new Map();
  const eventsByDate = new Map();
  const eventsByMonth = new Map();

  for (const event of catalog.events) {
    event.searchText = searchableEventText(event);
    if (event.sourceEventId) eventsBySourceId.set(event.sourceEventId, event);
    if (event.id) eventsById.set(event.id, event);
    if (!event.date) continue;

    if (!eventsByDate.has(event.date)) eventsByDate.set(event.date, []);
    eventsByDate.get(event.date).push(event);

    const month = event.date.slice(0, 7);
    if (!eventsByMonth.has(month)) eventsByMonth.set(month, []);
    eventsByMonth.get(month).push(event);

  }

  return {
    ...catalog,
    indexes: {
      eventsBySourceId,
      eventsById,
      eventsByDate,
      eventsByMonth
    }
  };
}

function loadCatalog() {
  if (!catalogCache) {
    catalogCache = buildIndexes(sanitizeCatalog(rebuildDirectories(normalizeCatalogWorks(mergeLatestCatalog(JSON.parse(readFileSync(catalogPath, "utf8")))))));
    console.log(`Loaded ${catalogCache.events.length.toLocaleString("ja-JP")} Eventernote events from server-side catalog.`);
  }
  return catalogCache;
}

function filterEvents(rows, { query = "", type = "all", city = "all" } = {}) {
  const workQuery = query ? detectWork(query) : "";
  return rows.filter((event) => {
    if (type !== "all" && event.type !== type) return false;
    if (city !== "all" && event.city !== city) return false;
    return !query || event.searchText.includes(query) || (workQuery && event.work === workQuery);
  });
}

function workMatches(work, query) {
  if (!query) return true;
  const text = `${work.title} ${work.category} ${work.trend || ""}`.toLowerCase();
  if (text.includes(query)) return true;
  return workRules().some(([title, aliases]) => (
    title === work.title && aliases.some((alias) => alias.toLowerCase().includes(query) || query.includes(alias.toLowerCase()))
  ));
}

function sendJson(response, payload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function paginate(rows, searchParams, defaultLimit = 48) {
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || defaultLimit)));
  const start = (page - 1) * limit;
  return {
    page,
    limit,
    total: rows.length,
    items: rows.slice(start, start + limit)
  };
}

function pushSuggestion(target, seen, value, query, limit) {
  const text = String(value || "").trim();
  if (!text || seen.has(text) || !text.toLowerCase().includes(query)) return;
  seen.add(text);
  target.push(text);
  return target.length >= limit;
}

function handleApi(pathname, searchParams, response) {
  const catalog = loadCatalog();

  if (pathname === "/api/meta") {
    sendJson(response, {
      ...catalog.meta,
      frontendMode: "paginated-api"
    });
    return true;
  }

  if (pathname === "/api/events") {
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const type = searchParams.get("type") || "all";
    const city = searchParams.get("city") || "all";
    const rows = filterEvents(catalog.events, { query, type, city });

    sendJson(response, paginate(rows, searchParams));
    return true;
  }

  if (pathname === "/api/calendar") {
    const month = searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      response.statusCode = 400;
      sendJson(response, { error: "month must be YYYY-MM" });
      return true;
    }

    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const type = searchParams.get("type") || "all";
    const city = searchParams.get("city") || "all";
    const selectedDate = searchParams.get("date") || "";
    const days = new Map();
    let total = 0;

    for (const event of filterEvents(catalog.indexes.eventsByMonth.get(month) || [], { query, type, city })) {
      total += 1;
      const current = days.get(event.date) || { date: event.date, count: 0, samples: [] };
      current.count += 1;
      if (current.samples.length < 3) {
        current.samples.push({
          id: event.id,
          title: event.title,
          venue: event.venue
        });
      }
      days.set(event.date, current);
    }

    const selectedRows = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? filterEvents(catalog.indexes.eventsByDate.get(selectedDate) || [], { query, type, city })
      : [];

    sendJson(response, {
      month,
      total,
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      selectedDate,
      selectedTotal: selectedRows.length,
      selectedItems: selectedRows
    });
    return true;
  }

  if (pathname === "/api/suggest") {
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const scope = searchParams.get("scope") || "events";
    const limit = Math.min(12, Math.max(1, Number(searchParams.get("limit") || 8)));
    const suggestions = [];
    const seen = new Set();

    if (scope === "artists") {
      for (const artist of catalog.artists) {
        if (pushSuggestion(suggestions, seen, artist.name, query, limit)) break;
      }
    } else if (scope === "works") {
      for (const work of catalog.works) {
        if (!isMeaningfulWorkTitle(work.title)) continue;
        if (workMatches(work, query) && pushSuggestion(suggestions, seen, work.title, "", limit)) break;
      }
    } else if (scope === "venues") {
      for (const venue of catalog.venues) {
        if (!isConcreteVenueName(venue.name)) continue;
        if (pushSuggestion(suggestions, seen, venue.name, query, limit)) break;
      }
    } else {
      for (const artist of catalog.artists) {
        if (pushSuggestion(suggestions, seen, artist.name, query, limit)) break;
      }
      for (const work of catalog.works) {
        if (!isMeaningfulWorkTitle(work.title)) continue;
        if (workMatches(work, query) && pushSuggestion(suggestions, seen, work.title, "", limit)) break;
      }
      for (const venue of catalog.venues) {
        if (!isConcreteVenueName(venue.name)) continue;
        if (pushSuggestion(suggestions, seen, venue.name, query, limit)) break;
      }
    }

    sendJson(response, { items: suggestions });
    return true;
  }

  if (pathname === "/api/calendar-years") {
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const type = searchParams.get("type") || "all";
    const city = searchParams.get("city") || "all";
    const years = new Map();
    let minDate = "";
    let maxDate = "";

    const baseRows = !query && type === "all" && city === "all"
      ? catalog.events
      : filterEvents(catalog.events, { query, type, city });

    for (const event of baseRows) {
      if (!event.date) continue;
      const year = event.date.slice(0, 4);
      const month = event.date.slice(5, 7);
      if (!years.has(year)) {
        years.set(year, {
          year,
          total: 0,
          months: Array.from({ length: 12 }, (_, index) => ({
            month: String(index + 1).padStart(2, "0"),
            count: 0
          }))
        });
      }

      const row = years.get(year);
      row.total += 1;
      row.months[Number(month) - 1].count += 1;
      if (!minDate || event.date < minDate) minDate = event.date;
      if (!maxDate || event.date > maxDate) maxDate = event.date;
    }

    sendJson(response, {
      minDate,
      maxDate,
      years: [...years.values()].sort((a, b) => b.year.localeCompare(a.year))
    });
    return true;
  }

  if (pathname === "/api/day-events") {
    const date = searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      response.statusCode = 400;
      sendJson(response, { error: "date must be YYYY-MM-DD" });
      return true;
    }

    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const type = searchParams.get("type") || "all";
    const city = searchParams.get("city") || "all";
    const rows = filterEvents(catalog.indexes.eventsByDate.get(date) || [], { query, type, city });

    sendJson(response, {
      date,
      total: rows.length,
      items: rows
    });
    return true;
  }

  if (pathname === "/api/event") {
    const sourceEventId = searchParams.get("sourceEventId") || "";
    const id = searchParams.get("id") || "";
    const event = sourceEventId
      ? catalog.indexes.eventsBySourceId.get(sourceEventId)
      : catalog.indexes.eventsById.get(id);

    if (!event) {
      response.statusCode = 404;
      sendJson(response, { error: "Event not found" });
      return true;
    }

    sendJson(response, { item: event });
    return true;
  }

  if (pathname === "/api/artists") {
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const rows = catalog.artists.filter((artist) => {
      if (!query) return true;
      return `${artist.name} ${artist.role}`.toLowerCase().includes(query);
    });
    sendJson(response, paginate(rows, searchParams, 36));
    return true;
  }

  if (pathname === "/api/works") {
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const rows = catalog.works.filter((work) => isMeaningfulWorkTitle(work.title) && workMatches(work, query));
    sendJson(response, paginate(rows, searchParams, 48));
    return true;
  }

  if (pathname === "/api/venues") {
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const rows = catalog.venues.filter((venue) => {
      if (!isConcreteVenueName(venue.name)) return false;
      if (!query) return true;
      return `${venue.name} ${venue.area}`.toLowerCase().includes(query);
    });
    sendJson(response, paginate(rows, searchParams, 48));
    return true;
  }

  return false;
}

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = decodeURIComponent(url.pathname);

  if (rawPath.startsWith("/api/")) {
    if (!handleApi(rawPath, url.searchParams, response)) {
      response.statusCode = 404;
      sendJson(response, { error: "Not found" });
    }
    return;
  }

  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    filePath = join(root, "index.html");
  }

  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  response.setHeader("Content-Type", types[extname(filePath)] || "application/octet-stream");
  response.setHeader("Cache-Control", "no-store");
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`Eventnote Japan running at http://${host}:${port}/`);
});
