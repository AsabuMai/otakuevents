import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const defaultUrl = "https://github.com/AsabuMai/otakuevents/releases/download/data-20260518/otakuevents-data-20260518.zip";
const url = process.argv.find((arg) => arg.startsWith("http")) || process.env.EVENTNOTE_DATA_URL || defaultUrl;
const root = process.cwd();
const downloadDir = join(root, "releases");
const zipPath = join(downloadDir, basename(new URL(url).pathname) || "otakuevents-data.zip");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function download() {
  await mkdir(downloadDir, { recursive: true });
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body, createWriteStream(zipPath));
  const size = await stat(zipPath);
  console.log(`Saved ${zipPath} (${(size.size / 1024 / 1024).toFixed(1)} MB)`);
}

if (!existsSync(zipPath)) {
  await download();
} else {
  const size = await stat(zipPath);
  console.log(`Using existing ${zipPath} (${(size.size / 1024 / 1024).toFixed(1)} MB)`);
}

console.log("Extracting data files...");
await run("unzip", ["-o", zipPath, "-d", root]);
console.log("Verifying data files...");
await run(process.execPath, ["scripts/verify-data.mjs"]);
console.log("Data is ready.");

if (process.argv.includes("--remove-zip")) {
  await rm(zipPath, { force: true });
  console.log(`Removed ${zipPath}`);
}
