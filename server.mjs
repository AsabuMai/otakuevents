import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, resolve } from "node:path";
import { createAuth } from "./server/auth.mjs";
import { createLocalDb } from "./server/local-db.mjs";
import {
  cleanEventRecord,
  isConcreteVenueName,
  isMeaningfulWorkTitle,
  normalizeLocationArea,
  normalizeVenueName
} from "./scripts/lib/clean.mjs";
import { detectType, detectWork, slugify, workRules } from "./scripts/lib/classify.mjs";

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
const venueNamesPath = join(dataRoot, "generated/venue-names.json");
const eventVenueOverridesPath = join(dataRoot, "generated/event-venue-overrides.json");
const generatedEventExtrasPath = join(dataRoot, "generated/event-extras.json");
const localDb = createLocalDb({ dataRoot });
const auth = createAuth({ dataRoot });
let catalogCache;
const rateLimitBuckets = new Map();

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

function inferAreaFromVenueName(value) {
  const name = String(value || "");
  const rules = [
    ["東京都", /(東京|TOKYO|渋谷|SHIBUYA|新宿|池袋|有明|豊洲|台場|お台場|秋葉原|AKIHABARA|アキバ|神田|日本橋|六本木|代官山|恵比寿|中野|立川|吉祥寺|町田|調布|日比谷|上野|浅草|両国|後楽園|水道橋|高田馬場|赤坂|原宿|表参道|五反田|荻窪|飯田橋|言問橋|TIF|clubasia|BLAZE GOTANDA|BLUE NOTE PLACE|Theater H|Zepp DiverCity|Zepp Haneda|Kanadevia Hall|TOKYO DOME CITY|TOYOTA ARENA TOKYO|ニッショーホール|SGC HALL ARIAKE|神楽坂)/i],
    ["神奈川県", /(横浜|YOKOHAMA|川崎|KAWASAKI|みなとみらい|藤沢|江の島|片瀬江ノ島|OPPA-LA|ぴあアリーナ|KT Zepp Yokohama)/i],
    ["千葉県", /(千葉|CHIBA|幕張|MAKUHARI|舞浜|浦安|船橋|LaLa arena TOKYO-BAY)/i],
    ["埼玉県", /(埼玉|SAITAMA|さいたま|大宮|所沢|川口|越谷|西武ドーム|ベルーナドーム|HEAVEN'S ROCK)/i],
    ["大阪府", /(大阪|OSAKA|梅田|UMEDA|難波|なんば|心斎橋|堺|枚方|吹田|MAWA LOOP|Zepp Osaka|BANGBOO)/i],
    ["京都府", /(京都|KYOTO|KBSホール|ロームシアター京都)/i],
    ["兵庫県", /(兵庫|神戸|KOBE|西宮|尼崎|姫路)/i],
    ["愛知県", /(愛知|名古屋|NAGOYA|一宮|栄|金山|COMTEC PORTBASE|IGアリーナ|愛知国際アリーナ|Zepp Nagoya)/i],
    ["福岡県", /(福岡|FUKUOKA|博多|小倉|久留米|福岡市民ホール|Zepp Fukuoka)/i],
    ["北海道", /(北海道|札幌|SAPPORO|函館|旭川|小樽|苫小牧|美唄|サッポロビール園|Zepp Sapporo)/i],
    ["宮城県", /(宮城|仙台|SENDAI|GIGS)/i],
    ["青森県", /(青森|AOMORI)/i],
    ["岩手県", /(岩手|盛岡|MORIOKA)/i],
    ["秋田県", /(秋田|AKITA)/i],
    ["山形県", /(山形|YAMAGATA)/i],
    ["福島県", /(福島|郡山|FUKUSHIMA)/i],
    ["茨城県", /(茨城|水戸|MITO)/i],
    ["栃木県", /(栃木|宇都宮|TOCHIGI)/i],
    ["群馬県", /(群馬|高崎|前橋|GUNMA)/i],
    ["広島県", /(広島|HIROSHIMA)/i],
    ["静岡県", /(静岡|浜松|沼津|清水)/i],
    ["長野県", /(長野|松本|軽井沢|富士見台高原|ヘブンスそのはら|阿智)/i],
    ["新潟県", /(新潟|NIIGATA)/i],
    ["石川県", /(石川|金沢)/i],
    ["岡山県", /(岡山|倉敷)/i],
    ["岐阜県", /(岐阜|GIFU)/i],
    ["三重県", /(三重|津市|四日市)/i],
    ["滋賀県", /(滋賀|大津)/i],
    ["奈良県", /(奈良|NARA)/i],
    ["和歌山県", /(和歌山|WAKAYAMA)/i],
    ["山口県", /(山口|下関)/i],
    ["鳥取県", /(鳥取|TOTTORI)/i],
    ["島根県", /(島根|松江)/i],
    ["徳島県", /(徳島|TOKUSHIMA)/i],
    ["香川県", /(香川|高松|あなぶきアリーナ)/i],
    ["愛媛県", /(愛媛|松山)/i],
    ["高知県", /(高知|KOCHI)/i],
    ["佐賀県", /(佐賀|SAGAアリーナ|SAGA Arena)/i],
    ["長崎県", /(長崎|NAGASAKI)/i],
    ["大分県", /(大分|OITA)/i],
    ["宮崎県", /(宮崎|MIYAZAKI)/i],
    ["鹿児島県", /(鹿児島|薩摩川内|川内駅|KAGOSHIMA)/i],
    ["熊本県", /(熊本|KUMAMOTO)/i],
    ["沖縄県", /(沖縄|那覇|OKINAWA)/i],
    ["韓国", /(Gocheok|고척|Seoul|ソウル|韓国|Korea|韓国公演)/i],
    ["台湾", /(台北|台中|高雄|台湾|TAIPEI|TAICHUNG|KAOHSIUNG)/i],
    ["香港", /(香港|Hong Kong|\bHK\b|HKCEC|PORTAL)/i],
    ["中国", /(上海|北京|広州|深圳|杭州|南京|成都|China|中国公演)/i],
    ["タイ", /(Suphachalasai|Bangkok|バンコク|タイ|Thailand)/i],
    ["インドネシア", /(Jakarta|ジャカルタ|Indonesia|インドネシア)/i],
    ["シンガポール", /(Singapore|シンガポール)/i],
    ["マレーシア", /(Kuala Lumpur|クアラルンプール|Malaysia|マレーシア)/i],
    ["フィリピン", /(Manila|マニラ|Philippine|フィリピン)/i],
    ["アメリカ", /(New York|Los Angeles|Atlanta|Chicago|Seattle|Portland|Washington|United States|USA|North America)/i],
    ["カナダ", /(Toronto|Vancouver|Canada|カナダ)/i],
    ["イギリス", /(London|Manchester|United Kingdom|UK|イギリス)/i],
    ["ドイツ", /(Berlin|Düsseldorf|Dusseldorf|Frankfurt|Germany|ドイツ)/i],
    ["オランダ", /(Amsterdam|Netherlands|オランダ)/i],
    ["ベルギー", /(Brussels|Belgium|ベルギー)/i],
    ["スペイン", /(Palacio Vistalegre|Madrid|マドリード|スペイン)/i],
    ["フランス", /(Accor Arena|Paris|パリ|フランス)/i]
  ];
  return rules.find(([, pattern]) => pattern.test(name))?.[0] || "";
}

function cleanArea(area, venueName = "", eventTitle = "") {
  const normalized = normalizeLocationArea(area);
  if (normalized && normalized !== "unknown" && normalized !== "未标注" && normalized !== "海外") return normalized;
  return inferAreaFromVenueName(`${venueName} ${eventTitle}`) || (normalized === "海外" ? normalized : "未标注");
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

function mergeVenueNameCache(catalog) {
  if (!existsSync(venueNamesPath)) return catalog;
  const rows = JSON.parse(readFileSync(venueNamesPath, "utf8"));
  const venueById = new Map(catalog.venues.map((venue) => [venue.id, venue]));
  for (const row of rows) {
    if (!row?.ok || !row.id || !row.name) continue;
    venueById.set(row.id, {
      ...(venueById.get(row.id) || { id: row.id, capacity: "未补全", events: 0 }),
      id: row.id,
      name: row.name,
      area: row.area || venueById.get(row.id)?.area || "",
      sourceUrl: row.sourceUrl || venueById.get(row.id)?.sourceUrl || ""
    });
  }
  return {
    ...catalog,
    venues: [...venueById.values()]
  };
}

function mergeEventVenueOverrides(catalog) {
  if (!existsSync(eventVenueOverridesPath)) return catalog;
  const rows = JSON.parse(readFileSync(eventVenueOverridesPath, "utf8")).filter((row) => row?.ok && row.name && row.sourceEventId);
  if (!rows.length) return catalog;
  const overridesByEventId = new Map(rows.map((row) => [String(row.sourceEventId), row]));
  return {
    ...catalog,
    events: catalog.events.map((event) => {
      const override = overridesByEventId.get(String(event.sourceEventId));
      if (!override) return event;
      return {
        ...event,
        venue: override.name,
        venueId: override.venueId || event.venueId || `eventernote-event-${event.sourceEventId}-venue`
      };
    })
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
          area: event.city && event.city !== "unknown" ? event.city : cleanArea("", event.venue, event.title),
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
    name: normalizeVenueName(venue.name),
    area: cleanArea(venue.area, venue.name)
  }));
  const venueAreaById = new Map(venues.map((venue) => [venue.id, cleanArea(venue.area, venue.name)]));
  const events = catalog.events.map((event) => ({
    ...event,
    type: detectType(event.title),
    city: cleanArea(venueAreaById.get(event.venueId) || event.city, event.venue, event.title),
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
    catalogCache = buildIndexes(sanitizeCatalog(rebuildDirectories(normalizeCatalogWorks(mergeEventVenueOverrides(mergeVenueNameCache(mergeLatestCatalog(JSON.parse(readFileSync(catalogPath, "utf8")))))))));
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

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function rateLimitRule(pathname, method) {
  if (process.env.RATE_LIMIT_ENABLED === "0") return null;
  if (pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/register")) {
    return { key: "auth", limit: 20, windowMs: 15 * 60 * 1000 };
  }
  if (method !== "GET") {
    return { key: "write", limit: 80, windowMs: 15 * 60 * 1000 };
  }
  if (pathname.startsWith("/api/suggest")) {
    return { key: "suggest", limit: 240, windowMs: 60 * 1000 };
  }
  return { key: "api", limit: 600, windowMs: 60 * 1000 };
}

function checkRateLimit(request, pathname) {
  const rule = rateLimitRule(pathname, request.method);
  if (!rule) return { ok: true };
  const now = Date.now();
  const key = `${rule.key}:${clientIp(request)}`;
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count <= rule.limit) return { ok: true };
  return {
    ok: false,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

function pruneRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function readJsonStore(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function readFavorites() {
  const store = localDb.readFavoritesStore();
  if (!store || typeof store !== "object" || !store.users || typeof store.users !== "object") return { users: {} };
  for (const [userId, value] of Object.entries(store.users)) {
    if (Array.isArray(value)) {
      store.users[userId] = {
        events: value,
        artists: [],
        works: [],
        venues: []
      };
    } else {
      store.users[userId] = normalizeFavoriteBucket(value);
    }
  }
  return store;
}

function normalizeFavoriteBucket(value = {}) {
  return {
    events: Array.isArray(value.events) ? value.events : [],
    artists: Array.isArray(value.artists) ? value.artists : [],
    works: Array.isArray(value.works) ? value.works : [],
    venues: Array.isArray(value.venues) ? value.venues : []
  };
}

function favoriteKeyFromBody(body) {
  return String(body?.key || body?.sourceEventId || body?.eventId || body?.id || body?.name || body?.title || "").trim();
}

function favoriteTypeFromBody(body) {
  const type = String(body?.type || "events").trim();
  return ["events", "artists", "works", "venues"].includes(type) ? type : "events";
}

function favoriteRowsForUser(catalog, userId) {
  const store = readFavorites();
  const bucket = normalizeFavoriteBucket(store.users[userId]);
  const eventIds = bucket.events;
  const favoriteIds = new Set(eventIds);
  const noteStore = readEventNotes();
  const userNotes = noteStore.users[userId] || {};
  const items = eventIds
    .map((sourceEventId) => catalog.indexes.eventsBySourceId.get(sourceEventId))
    .filter(Boolean)
    .map((event) => ({
      ...event,
      note: userNotes[event.sourceEventId] || { status: "none", memo: "" }
    }))
    .sort((a, b) => `${a.date || ""} ${a.title || ""}`.localeCompare(`${b.date || ""} ${b.title || ""}`));
  const artistByName = new Map(catalog.artists.map((artist) => [artist.name, artist]));
  const workByTitle = new Map(catalog.works.map((work) => [work.title, work]));
  const venueById = new Map(catalog.venues.map((venue) => [venue.id, venue]));
  return {
    favoriteIds: [...favoriteIds],
    favoriteArtists: bucket.artists.map((name) => artistByName.get(name) || { name, role: "Eventernote 出演者", follows: 0 }).filter(Boolean),
    favoriteWorks: bucket.works.map((title) => workByTitle.get(title) || { title, category: "作品/企划", trend: "手动收藏", events: 0 }).filter(Boolean),
    favoriteVenues: bucket.venues.map((id) => venueById.get(id)).filter(Boolean),
    ids: {
      events: bucket.events,
      artists: bucket.artists,
      works: bucket.works,
      venues: bucket.venues
    },
    items
  };
}

function readProfiles() {
  const store = localDb.readProfilesStore();
  return store && typeof store === "object" && store.users && typeof store.users === "object" ? store : { users: {} };
}

function readUsers() {
  return localDb.readUsersStore();
}

function profileForUser(user, profile = {}) {
  return {
    displayName: String(profile.displayName || user.displayName || user.username).slice(0, 40),
    homeArea: String(profile.homeArea || "").slice(0, 40),
    favoriteType: String(profile.favoriteType || "all").slice(0, 30),
    avatarUrl: String(profile.avatarUrl || "").slice(0, 500),
    coverUrl: String(profile.coverUrl || "").slice(0, 500),
    statusLine: String(profile.statusLine || "").slice(0, 80),
    bio: String(profile.bio || "").slice(0, 220),
    links: String(profile.links || "").slice(0, 600),
    tags: String(profile.tags || "").slice(0, 300),
    contacts: String(profile.contacts || "").slice(0, 500),
    interests: String(profile.interests || "").slice(0, 1200),
    visibility: profileVisibility(profile.visibility)
  };
}

function profileVisibility(value = {}) {
  const visibility = value && typeof value === "object" ? value : {};
  return {
    enabled: visibility.enabled !== false,
    links: visibility.links !== false,
    contacts: visibility.contacts === true,
    interests: visibility.interests !== false,
    follows: visibility.follows !== false,
    stats: visibility.stats !== false
  };
}

function publicProfileForUsername(catalog, username) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return null;
  const user = readUsers().users.find((row) => row.username === normalized);
  if (!user) return null;

  const profiles = readProfiles();
  const profile = profileForUser(user, profiles.users[user.id]);
  if (!profile.visibility.enabled) return null;
  const favorites = favoriteRowsForUser(catalog, user.id);
  const stats = {
    favoriteEvents: favorites.items.length,
    favoriteArtists: favorites.favoriteArtists.length,
    favoriteWorks: favorites.favoriteWorks.length,
    favoriteVenues: favorites.favoriteVenues.length,
    follows: favorites.favoriteArtists.length + favorites.favoriteWorks.length + favorites.favoriteVenues.length
  };
  return {
    user: {
      username: user.username,
      displayName: profile.displayName
    },
    profile: {
      displayName: profile.displayName,
      homeArea: profile.homeArea,
      favoriteType: profile.favoriteType,
      avatarUrl: profile.avatarUrl,
      coverUrl: profile.coverUrl,
      statusLine: profile.statusLine,
      bio: profile.bio,
      links: profile.visibility.links ? profile.links : "",
      contacts: profile.visibility.contacts ? profile.contacts : "",
      tags: profile.tags,
      interests: profile.visibility.interests ? profile.interests : ""
    },
    visibility: profile.visibility,
    stats: profile.visibility.stats ? stats : {
      favoriteEvents: 0,
      favoriteArtists: 0,
      favoriteWorks: 0,
      favoriteVenues: 0,
      follows: 0
    },
    follows: {
      artists: profile.visibility.follows ? favorites.favoriteArtists.slice(0, 12) : [],
      works: profile.visibility.follows ? favorites.favoriteWorks.slice(0, 12) : [],
      venues: profile.visibility.follows ? favorites.favoriteVenues.slice(0, 12) : []
    }
  };
}

function calendarTokenForUser(userId) {
  const store = readProfiles();
  store.users[userId] = store.users[userId] || {};
  if (!store.users[userId].calendarToken) {
    store.users[userId].calendarToken = randomBytes(18).toString("base64url");
    localDb.writeProfilesStore(store);
  }
  return store.users[userId].calendarToken;
}

function userIdFromCalendarToken(token) {
  if (!token) return "";
  const store = readProfiles();
  return Object.entries(store.users).find(([, profile]) => profile?.calendarToken === token)?.[0] || "";
}

function publicBaseUrl(request) {
  const proto = request.headers["x-forwarded-proto"] || "http";
  const hostHeader = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${hostHeader}`;
}

function sendText(response, body, contentType = "text/plain; charset=utf-8") {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDate(dateString) {
  return String(dateString || "").replaceAll("-", "");
}

function nextIcsDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function buildFavoritesIcs(catalog, userId, baseUrl) {
  const rows = favoriteRowsForUser(catalog, userId).items.filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date));
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Otakuevents//Favorites//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Otakuevents 我的活动",
    "X-WR-TIMEZONE:Asia/Tokyo"
  ];
  for (const event of rows) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:otakuevents-${event.sourceEventId}@otakuevents.local`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
      `DTEND;VALUE=DATE:${nextIcsDate(event.date)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `LOCATION:${escapeIcsText(displayIcsVenue(event))}`,
      `DESCRIPTION:${escapeIcsText(`${event.sourceName || "Eventernote"}\\n${event.sourceUrl || ""}`)}`,
      event.sourceUrl ? `URL:${event.sourceUrl}` : "",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

function displayIcsVenue(event) {
  return [event.venue, event.city && event.city !== "unknown" ? event.city : ""].filter(Boolean).join(" / ");
}

function readEventNotes() {
  const store = localDb.readEventNotesStore();
  return store && typeof store === "object" && store.users && typeof store.users === "object" ? store : { users: {} };
}

function eventNoteForUser(userId, sourceEventId) {
  const store = readEventNotes();
  return store.users[userId]?.[sourceEventId] || { status: "none", memo: "" };
}

function sanitizeEventNote(body = {}) {
  const status = ["none", "want", "ticketing", "done"].includes(body.status) ? body.status : "none";
  return {
    status,
    memo: String(body.memo || "").slice(0, 300),
    updatedAt: new Date().toISOString()
  };
}

function readInteractions() {
  const store = localDb.readInteractionsStore();
  return {
    questions: Array.isArray(store.questions) ? store.questions : [],
    corrections: Array.isArray(store.corrections) ? store.corrections : []
  };
}

function writeInteractions(store) {
  localDb.writeInteractionsStore({
    questions: Array.isArray(store.questions) ? store.questions : [],
    corrections: Array.isArray(store.corrections) ? store.corrections : []
  });
}

function userDirectory() {
  const users = readUsers().users;
  const profiles = readProfiles().users || {};
  return new Map(users.map((user) => {
    const profile = profileForUser(user, profiles[user.id]);
    return [user.id, {
      id: user.id,
      username: user.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      isAdmin: isAdminUser(user)
    }];
  }));
}

function publicAuthor(userId, directory = userDirectory()) {
  return directory.get(userId) || {
    id: userId,
    username: "unknown",
    displayName: "活动用户",
    avatarUrl: "",
    isAdmin: false
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

function eventStatusStats(sourceEventId) {
  const notes = readEventNotes();
  const counts = { want: 0, ticketing: 0, done: 0 };
  for (const userNotes of Object.values(notes.users || {})) {
    const status = userNotes?.[sourceEventId]?.status;
    if (status && Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
  }
  return {
    items: [
      { status: "want", label: "想去", count: counts.want },
      { status: "ticketing", label: "抽选/购票中", count: counts.ticketing },
      { status: "done", label: "已参加", count: counts.done }
    ],
    total: counts.want + counts.ticketing + counts.done
  };
}

function eventInteractionPayload(sourceEventId, currentUser = null) {
  const store = readInteractions();
  const directory = userDirectory();
  const questions = store.questions
    .filter((question) => question.sourceEventId === sourceEventId && !question.deletedAt)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((question) => ({
      ...question,
      author: publicAuthor(question.userId, directory),
      answers: (question.answers || [])
        .filter((answer) => !answer.deletedAt)
        .map((answer) => ({
          ...answer,
          author: publicAuthor(answer.userId, directory)
        }))
    }));
  const corrections = store.corrections
    .filter((correction) => correction.sourceEventId === sourceEventId && !correction.deletedAt)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((correction) => ({
      ...correction,
      author: publicAuthor(correction.userId, directory),
      confirmedByMe: currentUser ? (correction.confirmations || []).includes(currentUser.id) : false,
      confirmationCount: (correction.confirmations || []).length
    }));
  return {
    statusStats: eventStatusStats(sourceEventId),
    questions,
    corrections,
    currentUser: currentUser ? {
      username: currentUser.username,
      displayName: currentUser.displayName,
      isAdmin: isAdminUser(currentUser)
    } : null
  };
}

function eventSummaryBySourceId(catalog, sourceEventId) {
  const event = catalog.indexes.eventsBySourceId.get(sourceEventId);
  if (!event) return null;
  return {
    id: event.id,
    sourceEventId: event.sourceEventId,
    title: event.title,
    date: event.date,
    venue: event.venue,
    type: event.type
  };
}

function adminModerationPayload(catalog, currentUser) {
  const store = readInteractions();
  const directory = userDirectory();
  const pendingCorrections = store.corrections
    .filter((correction) => !correction.deletedAt && correction.status === "pending")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((correction) => ({
      ...correction,
      author: publicAuthor(correction.userId, directory),
      event: eventSummaryBySourceId(catalog, correction.sourceEventId),
      confirmationCount: (correction.confirmations || []).length
    }));
  const recentQuestions = store.questions
    .filter((question) => !question.deletedAt)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30)
    .map((question) => ({
      ...question,
      author: publicAuthor(question.userId, directory),
      event: eventSummaryBySourceId(catalog, question.sourceEventId),
      answerCount: (question.answers || []).filter((answer) => !answer.deletedAt).length
    }));
  return {
    currentUser: {
      username: currentUser.username,
      displayName: currentUser.displayName,
      isAdmin: true
    },
    pendingCorrections,
    recentQuestions
  };
}

function reviewCorrectionById(user, id, status) {
  if (!["confirmed", "rejected"].includes(status)) return null;
  const store = readInteractions();
  const correction = store.corrections.find((row) => row.id === String(id || ""));
  if (!correction) return null;
  correction.status = status;
  correction.reviewedBy = user.id;
  correction.reviewedAt = new Date().toISOString();
  writeInteractions(store);
  return correction;
}

function ensureEventExists(catalog, sourceEventId) {
  return sourceEventId && catalog.indexes.eventsBySourceId.has(sourceEventId);
}

function correctionFieldLabel(value) {
  return {
    title: "标题",
    date: "日期",
    venue: "会场",
    artists: "出演者",
    time: "时间",
    ticket: "票务",
    source: "来源链接",
    type: "类型",
    other: "其他"
  }[value] || "其他";
}

function readEventExtras() {
  const generated = readJsonStore(generatedEventExtrasPath, { events: {} });
  const local = localDb.readLocalEventExtrasStore();
  return {
    events: {
      ...(generated.events && typeof generated.events === "object" ? generated.events : {}),
      ...(local.events && typeof local.events === "object" ? local.events : {})
    }
  };
}

function emptyEventExtra() {
  return {
    openTime: "",
    startTime: "",
    officialUrl: "",
    ticketUrl: "",
    price: "",
    ticketInfo: "",
    source: ""
  };
}

function eventExtraFor(sourceEventId) {
  const store = readEventExtras();
  return store.events[sourceEventId] || emptyEventExtra();
}

function requireUser(request, response) {
  const user = auth.getCurrentUser(request);
  if (!user) {
    response.statusCode = 401;
    sendJson(response, { error: "请先登录。" });
    return null;
  }
  return user;
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
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

async function handleApi(request, pathname, searchParams, response) {
  if (pathname === "/api/health") {
    sendJson(response, {
      ok: true,
      dataRoot,
      catalogExists: existsSync(catalogPath),
      latestExists: existsSync(latestPath)
    });
    return true;
  }

  const catalog = loadCatalog();

  if (pathname === "/api/favorites" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return true;
    sendJson(response, favoriteRowsForUser(catalog, user.id));
    return true;
  }

  if (pathname === "/api/favorites" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const type = favoriteTypeFromBody(body);
    const key = favoriteKeyFromBody(body);
    if (!key || (type === "events" && !catalog.indexes.eventsBySourceId.has(key))) {
      response.statusCode = 400;
      sendJson(response, { error: "收藏对象不存在。" });
      return true;
    }
    const store = readFavorites();
    const bucket = normalizeFavoriteBucket(store.users[user.id]);
    const ids = new Set(bucket[type]);
    ids.add(key);
    bucket[type] = [...ids];
    store.users[user.id] = bucket;
    localDb.writeFavoritesStore(store);
    if (type === "events") {
      const notes = readEventNotes();
      const currentNote = notes.users[user.id]?.[key];
      if (!currentNote || currentNote.status === "none") {
        notes.users[user.id] = notes.users[user.id] || {};
        notes.users[user.id][key] = sanitizeEventNote({ status: "want", memo: currentNote?.memo || "" });
        localDb.writeEventNotesStore(notes);
      }
    }
    sendJson(response, favoriteRowsForUser(catalog, user.id));
    return true;
  }

  if (pathname === "/api/favorites" && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const type = favoriteTypeFromBody(body);
    const key = favoriteKeyFromBody(body);
    const store = readFavorites();
    const bucket = normalizeFavoriteBucket(store.users[user.id]);
    const ids = new Set(bucket[type]);
    ids.delete(key);
    bucket[type] = [...ids];
    store.users[user.id] = bucket;
    localDb.writeFavoritesStore(store);
    if (type === "events") {
      const notes = readEventNotes();
      const currentNote = notes.users[user.id]?.[key];
      if (currentNote?.status === "want" && !currentNote.memo) {
        notes.users[user.id][key] = sanitizeEventNote({ status: "none", memo: "" });
        localDb.writeEventNotesStore(notes);
      }
    }
    sendJson(response, favoriteRowsForUser(catalog, user.id));
    return true;
  }

  if (pathname === "/api/profile" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return true;
    const store = readProfiles();
    sendJson(response, { profile: profileForUser(user, store.users[user.id]) });
    return true;
  }

  if (pathname === "/api/profile" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const store = readProfiles();
    store.users[user.id] = {
      ...profileForUser(user, body),
      calendarToken: store.users[user.id]?.calendarToken
    };
    localDb.writeProfilesStore(store);
    sendJson(response, { profile: store.users[user.id] });
    return true;
  }

  if (pathname.startsWith("/api/users/") && request.method === "GET") {
    const username = pathname.slice("/api/users/".length);
    const publicProfile = publicProfileForUsername(catalog, username);
    if (!publicProfile) {
      response.statusCode = 404;
      sendJson(response, { error: "User not found" });
      return true;
    }
    sendJson(response, publicProfile);
    return true;
  }

  if (pathname === "/api/calendar-feed" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return true;
    const token = calendarTokenForUser(user.id);
    const url = `${publicBaseUrl(request)}/api/calendar.ics?token=${encodeURIComponent(token)}`;
    sendJson(response, {
      url,
      webcalUrl: url.replace(/^https?:\/\//, "webcal://")
    });
    return true;
  }

  if (pathname === "/api/calendar.ics" && request.method === "GET") {
    const token = searchParams.get("token") || "";
    const userId = userIdFromCalendarToken(token);
    if (!userId) {
      response.statusCode = 404;
      sendText(response, "Calendar feed not found");
      return true;
    }
    sendText(response, buildFavoritesIcs(catalog, userId, publicBaseUrl(request)), "text/calendar; charset=utf-8");
    return true;
  }

  if (pathname === "/api/event-note" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return true;
    const sourceEventId = searchParams.get("sourceEventId") || "";
    sendJson(response, { note: eventNoteForUser(user.id, sourceEventId) });
    return true;
  }

  if (pathname === "/api/event-extra" && request.method === "GET") {
    const sourceEventId = searchParams.get("sourceEventId") || "";
    sendJson(response, { extra: eventExtraFor(sourceEventId) });
    return true;
  }

  if (pathname === "/api/event-note" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const sourceEventId = String(body.sourceEventId || "").trim();
    if (!sourceEventId || !catalog.indexes.eventsBySourceId.has(sourceEventId)) {
      response.statusCode = 400;
      sendJson(response, { error: "活动不存在。" });
      return true;
    }
    const store = readEventNotes();
    store.users[user.id] = store.users[user.id] || {};
    store.users[user.id][sourceEventId] = sanitizeEventNote(body);
    localDb.writeEventNotesStore(store);
    sendJson(response, { note: store.users[user.id][sourceEventId] });
    return true;
  }

  if (pathname === "/api/event-interactions" && request.method === "GET") {
    const sourceEventId = searchParams.get("sourceEventId") || "";
    if (!ensureEventExists(catalog, sourceEventId)) {
      response.statusCode = 404;
      sendJson(response, { error: "Event not found" });
      return true;
    }
    sendJson(response, eventInteractionPayload(sourceEventId, auth.getCurrentUser(request)));
    return true;
  }

  if (pathname === "/api/event-question" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const sourceEventId = String(body.sourceEventId || "").trim();
    const text = String(body.body || "").trim().slice(0, 220);
    if (!ensureEventExists(catalog, sourceEventId) || !text) {
      response.statusCode = 400;
      sendJson(response, { error: "问题内容或活动不存在。" });
      return true;
    }
    const store = readInteractions();
    store.questions.push({
      id: `question-${randomBytes(8).toString("hex")}`,
      sourceEventId,
      userId: user.id,
      body: text,
      answers: [],
      createdAt: new Date().toISOString()
    });
    writeInteractions(store);
    sendJson(response, eventInteractionPayload(sourceEventId, user));
    return true;
  }

  if (pathname === "/api/event-answer" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const questionId = String(body.questionId || "").trim();
    const text = String(body.body || "").trim().slice(0, 260);
    const store = readInteractions();
    const question = store.questions.find((row) => row.id === questionId);
    if (!question || !text) {
      response.statusCode = 400;
      sendJson(response, { error: "回答内容或问题不存在。" });
      return true;
    }
    question.answers = Array.isArray(question.answers) ? question.answers : [];
    question.answers.push({
      id: `answer-${randomBytes(8).toString("hex")}`,
      userId: user.id,
      body: text,
      createdAt: new Date().toISOString()
    });
    writeInteractions(store);
    sendJson(response, eventInteractionPayload(question.sourceEventId, user));
    return true;
  }

  if (pathname === "/api/event-correction" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const sourceEventId = String(body.sourceEventId || "").trim();
    const field = ["title", "date", "venue", "artists", "time", "ticket", "source", "type", "other"].includes(body.field) ? body.field : "other";
    const value = String(body.value || "").trim().slice(0, 220);
    const note = String(body.note || "").trim().slice(0, 220);
    const sourceUrl = String(body.sourceUrl || "").trim().slice(0, 500);
    if (!ensureEventExists(catalog, sourceEventId) || !value) {
      response.statusCode = 400;
      sendJson(response, { error: "纠错内容或活动不存在。" });
      return true;
    }
    const store = readInteractions();
    store.corrections.push({
      id: `correction-${randomBytes(8).toString("hex")}`,
      sourceEventId,
      userId: user.id,
      field,
      fieldLabel: correctionFieldLabel(field),
      value,
      note,
      sourceUrl,
      status: "pending",
      confirmations: [user.id],
      createdAt: new Date().toISOString()
    });
    writeInteractions(store);
    sendJson(response, eventInteractionPayload(sourceEventId, user));
    return true;
  }

  if (pathname === "/api/event-correction-confirm" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readJsonBody(request);
    const store = readInteractions();
    const correction = store.corrections.find((row) => row.id === String(body.id || ""));
    if (!correction) {
      response.statusCode = 404;
      sendJson(response, { error: "纠错不存在。" });
      return true;
    }
    correction.confirmations = Array.isArray(correction.confirmations) ? correction.confirmations : [];
    if (!correction.confirmations.includes(user.id)) correction.confirmations.push(user.id);
    writeInteractions(store);
    sendJson(response, eventInteractionPayload(correction.sourceEventId, user));
    return true;
  }

  if (pathname === "/api/event-correction-review" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    if (!isAdminUser(user)) {
      response.statusCode = 403;
      sendJson(response, { error: "需要管理员权限。" });
      return true;
    }
    const body = await readJsonBody(request);
    const correction = reviewCorrectionById(user, body.id, body.status);
    if (!correction) {
      response.statusCode = 400;
      sendJson(response, { error: "纠错不存在或状态无效。" });
      return true;
    }
    sendJson(response, eventInteractionPayload(correction.sourceEventId, user));
    return true;
  }

  if (pathname === "/api/admin/moderation" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return true;
    if (!isAdminUser(user)) {
      response.statusCode = 403;
      sendJson(response, { error: "需要管理员权限。" });
      return true;
    }
    sendJson(response, adminModerationPayload(catalog, user));
    return true;
  }

  if (pathname === "/api/admin/correction-review" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return true;
    if (!isAdminUser(user)) {
      response.statusCode = 403;
      sendJson(response, { error: "需要管理员权限。" });
      return true;
    }
    const body = await readJsonBody(request);
    const correction = reviewCorrectionById(user, body.id, body.status);
    if (!correction) {
      response.statusCode = 400;
      sendJson(response, { error: "纠错不存在或状态无效。" });
      return true;
    }
    sendJson(response, adminModerationPayload(catalog, user));
    return true;
  }

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
    const sort = searchParams.get("sort") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateBefore = searchParams.get("dateBefore") || "";
    const rows = filterEvents(catalog.events, { query, type, city }).filter((event) => {
      if (dateFrom && (!event.date || event.date < dateFrom)) return false;
      if (dateBefore && (!event.date || event.date >= dateBefore)) return false;
      return true;
    });
    if (sort === "date-desc") {
      rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    } else if (sort === "date-asc") {
      rows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    }

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

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = decodeURIComponent(url.pathname);

  if (rawPath.startsWith("/api/")) {
    const rateLimit = checkRateLimit(request, rawPath);
    if (!rateLimit.ok) {
      response.statusCode = 429;
      response.setHeader("Retry-After", String(rateLimit.retryAfter));
      sendJson(response, { error: "请求过于频繁，请稍后再试。" });
      return;
    }
    try {
      if (await auth.handleAuthApi(request, response, rawPath)) return;
    } catch (error) {
      response.statusCode = 400;
      sendJson(response, { error: error?.message || "Invalid request" });
      return;
    }

    if (!(await handleApi(request, rawPath, url.searchParams, response))) {
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

setInterval(pruneRateLimitBuckets, 60 * 1000).unref();
