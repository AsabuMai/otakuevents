import { readFileSync, writeFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("data/generated/eventernote-catalog.json", "utf8"));
const outPath = "data/generated/venue-names.json";
const existingRows = JSON.parse(readFileSync(outPath, "utf8"));
const existingById = new Map(existingRows.map((venue) => [venue.id, venue]));

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);
const limit = Number(args.get("limit") || 250);
const priority = args.get("priority") || "recent";

function getCandidateIds() {
  if (args.has("ids")) {
    return args
      .get("ids")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id));
  }

  const stats = new Map();
  for (const event of catalog.events) {
    const id = event.venueId?.replace("eventernote-place-", "");
    if (!id || id === "unknown" || !/^\d+$/.test(id)) continue;
    const venueId = `eventernote-place-${id}`;
    const existing = existingById.get(venueId);
    if (existing?.ok && existing.name) continue;
    const current = stats.get(id) || { id, count: 0, latest: "" };
    current.count += 1;
    if (event.date > current.latest) current.latest = event.date;
    stats.set(id, current);
  }

  return [...stats.values()]
    .sort((a, b) => {
      if (priority === "count") return b.count - a.count || b.latest.localeCompare(a.latest);
      return b.latest.localeCompare(a.latest) || b.count - a.count;
    })
    .slice(0, limit)
    .map((row) => row.id);
}

const ids = getCandidateIds();

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchPlace(id) {
  const url = `https://www.eventernote.com/places/${id}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "eventnote-prototype/0.1 venue-name-cache"
    }
  });

  if (!response.ok) {
    return { id: `eventernote-place-${id}`, name: "", area: "", sourceUrl: url, ok: false };
  }

  const html = await response.text();
  const name = decodeHtml(html.match(/<div class="gb_place_detail_title[^"]*"[^>]*>\s*<h2>([^<]+)<\/h2>/)?.[1]?.trim() || "");
  const prefecture = decodeHtml(html.match(/<a href="\/places\/prefecture\/\d+">([^<]+)<\/a>/)?.[1]?.trim() || "");

  return {
    id: `eventernote-place-${id}`,
    name,
    area: prefecture,
    sourceUrl: url,
    ok: Boolean(name)
  };
}

const rows = [];
for (const [index, id] of ids.entries()) {
  const row = await fetchPlace(id);
  rows.push(row);
  console.log(`${index + 1}/${ids.length} ${id} ${row.name || "unresolved"}`);
  await new Promise((resolve) => setTimeout(resolve, 180));
}

const merged = new Map(existingRows.map((venue) => [venue.id, venue]));
for (const row of rows) merged.set(row.id, row);

const nextRows = [...merged.values()].sort((a, b) => {
  if (a.ok !== b.ok) return a.ok ? -1 : 1;
  return a.id.localeCompare(b.id, "en", { numeric: true });
});

writeFileSync(outPath, JSON.stringify(nextRows, null, 2));
console.log(`Fetched ${rows.length} venue records; cache now has ${nextRows.length} records -> ${outPath}`);
