import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  "data/generated/eventernote-catalog.json"
];

const optionalFiles = [
  "data/generated/eventernote-latest.json",
  "data/generated/venue-names.json",
  "data/generated/event-venue-overrides.json",
  "data/generated/venue-manual-overrides.json",
  "data/raw/eventernote-events.json"
];

let hasMissingRequired = false;

function report(path, required) {
  const fullPath = join(process.cwd(), path);
  if (!existsSync(fullPath)) {
    console.log(`${required ? "missing" : "optional"}  ${path}`);
    if (required) hasMissingRequired = true;
    return;
  }
  const size = statSync(fullPath).size;
  console.log(`ok       ${path} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

for (const path of requiredFiles) report(path, true);
for (const path of optionalFiles) report(path, false);

if (hasMissingRequired) {
  console.error("\nRequired data is missing. See data/README.md for bootstrap options.");
  process.exit(1);
}
