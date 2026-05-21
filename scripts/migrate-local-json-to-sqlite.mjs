import { isAbsolute, join, resolve } from "node:path";
import { createLocalDb } from "../server/local-db.mjs";

const root = process.cwd();
const dataRoot = process.env.EVENTNOTE_DATA_DIR
  ? isAbsolute(process.env.EVENTNOTE_DATA_DIR)
    ? process.env.EVENTNOTE_DATA_DIR
    : resolve(root, process.env.EVENTNOTE_DATA_DIR)
  : join(root, "data");

const localDb = createLocalDb({ dataRoot });
const users = localDb.readUsersStore().users.length;
const profiles = Object.keys(localDb.readProfilesStore().users).length;
const favorites = countFavorites(localDb.readFavoritesStore());
const notes = countNested(localDb.readEventNotesStore().users);
const interactions = localDb.readInteractionsStore();
const extras = Object.keys(localDb.readLocalEventExtrasStore().events).length;

console.log(JSON.stringify({
  dataRoot,
  database: join(dataRoot, "local/otakuevents.db"),
  users,
  profiles,
  favorites,
  eventNotes: notes,
  questions: interactions.questions.length,
  corrections: interactions.corrections.length,
  eventExtras: extras
}, null, 2));

function countFavorites(store) {
  return Object.values(store.users || {}).reduce((sum, bucket) => {
    return sum + ["events", "artists", "works", "venues"].reduce((bucketSum, type) => bucketSum + (bucket?.[type]?.length || 0), 0);
  }, 0);
}

function countNested(users) {
  return Object.values(users || {}).reduce((sum, rows) => sum + Object.keys(rows || {}).length, 0);
}
