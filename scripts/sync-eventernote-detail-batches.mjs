import { spawn } from "node:child_process";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  return [key, value || "true"];
}));

const startMonth = args.get("start-month") || "2024-05";
const endMonth = args.get("end-month") || "2026-05";
const detailLimit = Number(args.get("detail-limit") || 12000);
const forceDetail = args.get("force-detail") === "true";

function pad(value) {
  return String(value).padStart(2, "0");
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonth(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  return `${next[0]}-${pad(next[1])}`;
}

function monthRange(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(monthEnd(year, month))}`
  };
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

for (let current = startMonth; current <= endMonth; current = addMonth(current)) {
  const { start, end } = monthRange(current);
  const scriptArgs = [
    "scripts/sync-eventernote-latest.mjs",
    `--start=${start}`,
    `--end=${end}`,
    `--detail-limit=${detailLimit}`
  ];
  if (forceDetail) scriptArgs.push("--force-detail");

  console.log(`\n=== Syncing details ${current} (${start} - ${end}) ===`);
  await runCommand("node", scriptArgs);
}

console.log(`\nFinished detail batches: ${startMonth} - ${endMonth}`);
