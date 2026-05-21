import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dataRoot = resolvePath(process.env.EVENTNOTE_DATA_DIR || join(root, "data"));
const backupRoot = resolvePath(process.env.BACKUP_DIR || join(root, "backups"));
const localDir = join(dataRoot, "local");

if (!existsSync(localDir)) {
  console.error(`Local data directory not found: ${localDir}`);
  process.exit(1);
}

mkdirSync(backupRoot, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archiveName = `otakuevents-local-${stamp}.tar.gz`;
const archivePath = join(backupRoot, archiveName);
const include = [
  "otakuevents.db",
  "otakuevents.db-wal",
  "otakuevents.db-shm",
  "auth-secret"
].filter((name) => existsSync(join(localDir, name)));

if (!include.includes("otakuevents.db")) {
  console.error(`SQLite database not found: ${join(localDir, "otakuevents.db")}`);
  process.exit(1);
}

const result = spawnSync("tar", ["-czf", archivePath, "-C", localDir, ...include], {
  encoding: "utf8"
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "tar failed");
  process.exit(result.status || 1);
}

console.log(JSON.stringify({
  archive: archivePath,
  files: include
}, null, 2));

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(root, value);
}
