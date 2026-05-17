import { readFileSync } from "node:fs";
import { isConcreteVenueName, isMeaningfulWorkTitle, normalizeVenueName } from "./lib/clean.mjs";

const paths = process.argv.slice(2);
const files = paths.length ? paths : [
  "data/generated/eventernote-catalog.json",
  "data/generated/eventernote-latest.json"
];

function top(map, limit = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

for (const path of files) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const events = data.events || [];
  const missingWork = events.filter((event) => !isMeaningfulWorkTitle(event.work)).length;
  const missingVenue = events.filter((event) => !isConcreteVenueName(event.venue)).length;
  const missingArtists = events.filter((event) => !(event.artists || []).length).length;
  const eventernoteTags = events.filter((event) => (event.tags || []).some((tag) => String(tag).toLowerCase() === "eventernote")).length;
  const liveTags = events.filter((event) => (event.tags || []).some((tag) => String(tag).toLowerCase() === "live")).length;
  const placeholderVenues = new Map();
  const workCounts = new Map();

  for (const event of events) {
    if (!isConcreteVenueName(event.venue)) {
      const venue = normalizeVenueName(event.venue) || "(blank)";
      placeholderVenues.set(venue, (placeholderVenues.get(venue) || 0) + 1);
    }
    if (isMeaningfulWorkTitle(event.work)) {
      workCounts.set(event.work, (workCounts.get(event.work) || 0) + 1);
    }
  }

  console.log(`\n${path}`);
  console.log({
    events: events.length,
    missingWork,
    missingVenue,
    missingArtists,
    eventernoteTags,
    liveTags,
    knownWorks: workCounts.size
  });
  console.log("top placeholder venues", top(placeholderVenues));
  console.log("top works", top(workCounts));
}
