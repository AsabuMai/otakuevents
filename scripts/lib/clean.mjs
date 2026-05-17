import { detectType, detectWork, makeTags, slugify } from "./classify.mjs";

const nonConcreteVenuePattern = /(某所|某会場|某会场|市内某|都内某|未定|未詳|未详|非公開|非公开|未発表|未发表|未告知|TBA|調整中)/i;

export function normalizeVenueName(value) {
  return String(value || "").replace(/^!_*/, "").trim();
}

export function isConcreteVenueName(value) {
  const name = normalizeVenueName(value);
  if (!name || name === "会场名待补全" || name === "会场未详" || name === "会場未詳") return false;
  return !nonConcreteVenuePattern.test(name);
}

export function normalizeLocationArea(value) {
  const area = String(value || "").trim();
  if (!area || area === "Eventernote place_id" || area === "Eventernote 活动页") return "unknown";
  return area.replace(/の会場一覧$/, "");
}

export function isMeaningfulWorkTitle(value) {
  const title = String(value || "").trim();
  return Boolean(title && !["Eventernote", "eventernote"].includes(title));
}

export function cleanTags(tags = []) {
  const ignored = new Set(["eventernote", "live", "stage", "talk", "fan event", "舞台"]);
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const text = String(tag || "").trim();
    const key = text.toLowerCase();
    if (!text || ignored.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

export function cleanArtistName(value) {
  const name = String(value || "").trim();
  if (!name || /のイベント$/.test(name)) return "";
  return name;
}

export function cleanEventRecord(event) {
  const title = String(event?.title || "").trim();
  const type = detectType(title);
  const work = detectWork(title);
  const venue = normalizeVenueName(event?.venue);
  const concreteVenue = isConcreteVenueName(venue);
  const artistRows = (event?.artists || [])
    .map((artist, index) => ({
      id: event?.artistIds?.[index] || "",
      name: cleanArtistName(artist)
    }))
    .filter((row) => row.name);
  const seenArtists = new Set();
  const artists = [];
  const artistIds = [];

  for (const row of artistRows) {
    const key = row.id || row.name;
    if (seenArtists.has(key)) continue;
    seenArtists.add(key);
    artists.push(row.name);
    artistIds.push(row.id || `eventernote-actor-${slugify(row.name)}`);
  }

  return {
    ...event,
    title,
    type,
    venue: concreteVenue ? venue : "",
    venueId: concreteVenue ? event.venueId : "",
    workId: work ? slugify(work) : "",
    work,
    artistIds,
    artists,
    tags: cleanTags(event?.tags?.length ? event.tags : makeTags(title, type))
  };
}
