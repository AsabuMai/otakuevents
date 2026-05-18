import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const outputDir = join(root, "releases");
const outputName = `otakuevents-data-${stamp}.zip`;
const outputPath = join(outputDir, outputName);

const files = [
  "data/raw/eventernote-events.json",
  "data/generated/eventernote-catalog.json",
  "data/generated/eventernote-latest.json",
  "data/generated/venue-names.json",
  "data/generated/event-venue-overrides.json",
  "data/generated/venue-manual-overrides.json"
];

const missing = files.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error("Cannot pack data. Missing files:");
  for (const file of missing) console.error(`- ${file}`);
  console.error("\nRun npm run data:verify for details.");
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });

await new Promise((resolve, reject) => {
  const child = spawn("zip", ["-9", "-r", outputPath, ...files], {
    cwd: root,
    stdio: "inherit"
  });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`zip exited with code ${code}`));
  });
});

const size = await stat(outputPath);
console.log(`\nCreated ${outputPath}`);
console.log(`Size: ${(size.size / 1024 / 1024).toFixed(1)} MB`);
console.log("\nUpload this zip to GitHub Releases, Google Drive, OneDrive, or another shared storage.");
