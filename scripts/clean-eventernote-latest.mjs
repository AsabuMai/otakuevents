import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cleanEventRecord, isConcreteVenueName, isMeaningfulWorkTitle } from "./lib/clean.mjs";

const outPath = "data/generated/eventernote-latest.json";

if (!existsSync(outPath)) {
  console.log(`${outPath} does not exist.`);
  process.exit(0);
}

const source = JSON.parse(readFileSync(outPath, "utf8"));
const events = (source.events || [])
  .map(cleanEventRecord)
  .filter((event) => event.title && event.date)
  .sort((a, b) => `${b.date}-${b.sourceEventId}`.localeCompare(`${a.date}-${a.sourceEventId}`));
const eventDates = events.map((event) => event.date).filter(Boolean).sort();
const concreteVenues = new Set(events.filter((event) => event.venueId && isConcreteVenueName(event.venue)).map((event) => event.venueId));
const works = new Set(events.filter((event) => isMeaningfulWorkTitle(event.work)).map((event) => event.work));
const tagged = events.filter((event) => event.tags?.length).length;
const tmpPath = `${outPath}.tmp`;

writeFileSync(tmpPath, JSON.stringify({
  ...source,
  meta: {
    ...(source.meta || {}),
    startDate: eventDates[0] || source.meta?.startDate || "",
    endDate: eventDates[eventDates.length - 1] || source.meta?.endDate || "",
    events: events.length,
    concreteVenues: concreteVenues.size,
    works: works.size,
    taggedEvents: tagged,
    cleanedAt: new Date().toISOString()
  },
  events
}, null, 2));
renameSync(tmpPath, outPath);

console.log(`Cleaned ${events.length} latest events -> ${outPath}`);
console.log(`Concrete venues: ${concreteVenues.size}; works: ${works.size}; tagged events: ${tagged}`);
