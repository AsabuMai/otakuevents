import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] || "data/generated/event-extras.json";
const outputPath = process.argv[3] || inputPath;

const raw = JSON.parse(await readFile(inputPath, "utf8"));
const sourceEvents = raw.events && typeof raw.events === "object" ? raw.events : {};
const cleanedEvents = {};

const stats = {
  input: Object.keys(sourceEvents).length,
  output: 0,
  droppedEmpty: 0,
  normalizedPrice: 0,
  normalizedTicketInfo: 0,
  droppedFields: 0
};

for (const [id, event] of Object.entries(sourceEvents)) {
  const cleaned = cleanEventExtra(event);
  if (!hasUsefulExtra(cleaned)) {
    stats.droppedEmpty += 1;
    continue;
  }
  cleanedEvents[id] = cleaned;
  stats.output += 1;
}

const output = {
  meta: {
    ...(raw.meta || {}),
    stored: stats.output,
    cleanedAt: new Date().toISOString(),
    cleaning: {
      droppedEmpty: stats.droppedEmpty,
      compactSchema: true,
      removedPerEventFields: ["id", "sourceEventId", "eventDate", "sourceUrl", "updatedAt"],
      priceDeduped: true,
      ticketInfoDeduped: true
    }
  },
  events: cleanedEvents
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`);

console.log(JSON.stringify(stats, null, 2));

function cleanEventExtra(event = {}) {
  const beforePrice = String(event.price || "");
  const beforeTicketInfo = String(event.ticketInfo || "");
  const cleaned = {
    openTime: cleanTime(event.openTime),
    startTime: cleanTime(event.startTime),
    officialUrl: cleanUrl(event.officialUrl),
    ticketUrl: cleanUrl(event.ticketUrl),
    price: cleanPrice(beforePrice),
    ticketInfo: cleanTicketInfo(beforeTicketInfo)
  };
  if (event.source) cleaned.source = String(event.source).trim().slice(0, 40);
  if (cleaned.price !== beforePrice.trim()) stats.normalizedPrice += 1;
  if (cleaned.ticketInfo !== beforeTicketInfo.trim()) stats.normalizedTicketInfo += 1;
  stats.droppedFields += ["id", "sourceEventId", "eventDate", "sourceUrl", "updatedAt"].filter((key) => key in event).length;
  return removeEmptyFields(cleaned);
}

function cleanTime(value) {
  const text = String(value || "").trim().replace("：", ":");
  const match = text.match(/\b([0-2]?\d:[0-5]\d)\b/);
  if (!match) return "";
  const [hour, minute] = match[1].split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

function cleanUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  return url.slice(0, 300);
}

function cleanPrice(value) {
  const text = normalizeSpaces(value);
  if (!text) return "";
  const parts = text
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return dedupeKeepingOrder(parts).join(" / ").slice(0, 180);
}

function cleanTicketInfo(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
  return dedupeKeepingOrder(lines).slice(0, 8).join("\n").slice(0, 700);
}

function normalizeSpaces(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([、。，．：；])/g, "$1")
    .trim();
}

function dedupeKeepingOrder(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function hasUsefulExtra(event) {
  return Boolean(event.openTime || event.startTime || event.officialUrl || event.ticketUrl || event.price || event.ticketInfo);
}

function removeEmptyFields(event) {
  return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== ""));
}
