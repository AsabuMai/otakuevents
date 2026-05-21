import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const instances = new Map();

export function createLocalDb({ dataRoot }) {
  const localDir = join(dataRoot, "local");
  mkdirSync(localDir, { recursive: true });
  const dbPath = join(localDir, "otakuevents.db");
  if (instances.has(dbPath)) return instances.get(dbPath);

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSchema(db);
  const api = buildApi(db, localDir);
  api.migrateJsonStores();
  instances.set(dbPath, api);
  return api;
}

function migrateSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      home_area TEXT NOT NULL DEFAULT '',
      favorite_type TEXT NOT NULL DEFAULT 'all',
      avatar_url TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      status_line TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      links TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      contacts TEXT NOT NULL DEFAULT '',
      interests TEXT NOT NULL DEFAULT '',
      visibility_json TEXT NOT NULL DEFAULT '{}',
      calendar_token TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, type, key)
    );
    CREATE TABLE IF NOT EXISTS event_notes (
      user_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      status TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source_event_id)
    );
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      source_event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      source_event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      field TEXT NOT NULL,
      field_label TEXT NOT NULL,
      value TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      reviewed_by TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS correction_confirmations (
      correction_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (correction_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS event_extras (
      source_event_id TEXT PRIMARY KEY,
      open_time TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      official_url TEXT NOT NULL DEFAULT '',
      ticket_url TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT '',
      ticket_info TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);
}

function buildApi(db, localDir) {
  const now = () => new Date().toISOString();
  const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
  const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

  const api = {
    migrateJsonStores() {
      if (getMeta.get("jsonMigrated")?.value === "1") return;
      migrateUsers(api, localDir);
      migrateProfiles(api, localDir);
      migrateFavorites(api, localDir);
      migrateEventNotes(api, localDir);
      migrateInteractions(api, localDir);
      migrateEventExtras(api, localDir);
      setMeta.run("jsonMigrated", "1");
    },

    readUsersStore() {
      return {
        users: db.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(userFromRow)
      };
    },

    findUserByUsername(username) {
      const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
      return row ? userFromRow(row) : null;
    },

    findUserById(id) {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return row ? userFromRow(row) : null;
    },

    insertUser(user) {
      db.prepare(`
        INSERT INTO users (id, username, display_name, password_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, user.username, user.displayName, JSON.stringify(user.password || {}), user.createdAt || now());
    },

    readProfilesStore() {
      const users = {};
      for (const row of db.prepare("SELECT * FROM profiles").all()) {
        users[row.user_id] = profileFromRow(row);
      }
      return { users };
    },

    writeProfilesStore(store) {
      db.exec("DELETE FROM profiles");
      const insert = db.prepare(`
        INSERT INTO profiles (
          user_id, display_name, home_area, favorite_type, avatar_url, cover_url,
          status_line, bio, links, tags, contacts, interests, visibility_json, calendar_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [userId, profile] of Object.entries(store.users || {})) {
        insert.run(
          userId,
          profile.displayName || "",
          profile.homeArea || "",
          profile.favoriteType || "all",
          profile.avatarUrl || "",
          profile.coverUrl || "",
          profile.statusLine || "",
          profile.bio || "",
          profile.links || "",
          profile.tags || "",
          profile.contacts || "",
          profile.interests || "",
          JSON.stringify(profile.visibility || {}),
          profile.calendarToken || ""
        );
      }
    },

    readFavoritesStore() {
      const users = {};
      for (const row of db.prepare("SELECT * FROM favorites ORDER BY created_at ASC").all()) {
        users[row.user_id] ||= { events: [], artists: [], works: [], venues: [] };
        users[row.user_id][row.type] ||= [];
        users[row.user_id][row.type].push(row.key);
      }
      return { users };
    },

    writeFavoritesStore(store) {
      db.exec("DELETE FROM favorites");
      const insert = db.prepare("INSERT OR IGNORE INTO favorites (user_id, type, key, created_at) VALUES (?, ?, ?, ?)");
      for (const [userId, bucket] of Object.entries(store.users || {})) {
        for (const type of ["events", "artists", "works", "venues"]) {
          for (const key of bucket?.[type] || []) insert.run(userId, type, key, now());
        }
      }
    },

    readEventNotesStore() {
      const users = {};
      for (const row of db.prepare("SELECT * FROM event_notes").all()) {
        users[row.user_id] ||= {};
        users[row.user_id][row.source_event_id] = {
          status: row.status,
          memo: row.memo,
          updatedAt: row.updated_at
        };
      }
      return { users };
    },

    writeEventNotesStore(store) {
      db.exec("DELETE FROM event_notes");
      const insert = db.prepare("INSERT INTO event_notes (user_id, source_event_id, status, memo, updated_at) VALUES (?, ?, ?, ?, ?)");
      for (const [userId, notes] of Object.entries(store.users || {})) {
        for (const [sourceEventId, note] of Object.entries(notes || {})) {
          insert.run(userId, sourceEventId, note.status || "none", note.memo || "", note.updatedAt || now());
        }
      }
    },

    readInteractionsStore() {
      const questions = db.prepare("SELECT * FROM questions ORDER BY created_at ASC").all().map((row) => ({
        id: row.id,
        sourceEventId: row.source_event_id,
        userId: row.user_id,
        body: row.body,
        createdAt: row.created_at,
        deletedAt: row.deleted_at || null,
        answers: []
      }));
      const byQuestion = new Map(questions.map((question) => [question.id, question]));
      for (const row of db.prepare("SELECT * FROM answers ORDER BY created_at ASC").all()) {
        byQuestion.get(row.question_id)?.answers.push({
          id: row.id,
          userId: row.user_id,
          body: row.body,
          createdAt: row.created_at,
          deletedAt: row.deleted_at || null
        });
      }

      const corrections = db.prepare("SELECT * FROM corrections ORDER BY created_at ASC").all().map((row) => ({
        id: row.id,
        sourceEventId: row.source_event_id,
        userId: row.user_id,
        field: row.field,
        fieldLabel: row.field_label,
        value: row.value,
        note: row.note,
        sourceUrl: row.source_url,
        status: row.status,
        createdAt: row.created_at,
        reviewedBy: row.reviewed_by || "",
        reviewedAt: row.reviewed_at || "",
        deletedAt: row.deleted_at || null,
        confirmations: []
      }));
      const byCorrection = new Map(corrections.map((correction) => [correction.id, correction]));
      for (const row of db.prepare("SELECT * FROM correction_confirmations").all()) {
        byCorrection.get(row.correction_id)?.confirmations.push(row.user_id);
      }
      return { questions, corrections };
    },

    writeInteractionsStore(store) {
      db.exec("DELETE FROM answers; DELETE FROM questions; DELETE FROM correction_confirmations; DELETE FROM corrections;");
      const insertQuestion = db.prepare("INSERT INTO questions (id, source_event_id, user_id, body, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)");
      const insertAnswer = db.prepare("INSERT INTO answers (id, question_id, user_id, body, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const question of store.questions || []) {
        insertQuestion.run(question.id, question.sourceEventId, question.userId, question.body, question.createdAt || now(), question.deletedAt || null);
        for (const answer of question.answers || []) {
          insertAnswer.run(answer.id, question.id, answer.userId, answer.body, answer.createdAt || now(), answer.deletedAt || null);
        }
      }
      const insertCorrection = db.prepare(`
        INSERT INTO corrections (
          id, source_event_id, user_id, field, field_label, value, note, source_url,
          status, created_at, reviewed_by, reviewed_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertConfirmation = db.prepare("INSERT OR IGNORE INTO correction_confirmations (correction_id, user_id, created_at) VALUES (?, ?, ?)");
      for (const correction of store.corrections || []) {
        insertCorrection.run(
          correction.id,
          correction.sourceEventId,
          correction.userId,
          correction.field,
          correction.fieldLabel,
          correction.value,
          correction.note || "",
          correction.sourceUrl || "",
          correction.status || "pending",
          correction.createdAt || now(),
          correction.reviewedBy || "",
          correction.reviewedAt || "",
          correction.deletedAt || null
        );
        for (const userId of correction.confirmations || []) insertConfirmation.run(correction.id, userId, now());
      }
    },

    readLocalEventExtrasStore() {
      const events = {};
      for (const row of db.prepare("SELECT * FROM event_extras").all()) {
        events[row.source_event_id] = {
          openTime: row.open_time,
          startTime: row.start_time,
          officialUrl: row.official_url,
          ticketUrl: row.ticket_url,
          price: row.price,
          ticketInfo: row.ticket_info,
          source: row.source
        };
      }
      return { events };
    },

    writeLocalEventExtrasStore(store) {
      db.exec("DELETE FROM event_extras");
      const insert = db.prepare(`
        INSERT INTO event_extras (
          source_event_id, open_time, start_time, official_url, ticket_url,
          price, ticket_info, source, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [sourceEventId, extra] of Object.entries(store.events || {})) {
        insert.run(
          sourceEventId,
          extra.openTime || "",
          extra.startTime || "",
          extra.officialUrl || "",
          extra.ticketUrl || "",
          extra.price || "",
          extra.ticketInfo || "",
          extra.source || "",
          extra.updatedAt || now()
        );
      }
    }
  };

  return api;
}

function userFromRow(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    password: parseJson(row.password_json, {}),
    createdAt: row.created_at
  };
}

function profileFromRow(row) {
  return {
    displayName: row.display_name,
    homeArea: row.home_area,
    favoriteType: row.favorite_type,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url,
    statusLine: row.status_line,
    bio: row.bio,
    links: row.links,
    tags: row.tags,
    contacts: row.contacts,
    interests: row.interests,
    visibility: parseJson(row.visibility_json, {}),
    calendarToken: row.calendar_token
  };
}

function migrateUsers(api, localDir) {
  const store = readJson(join(localDir, "users.json"), { users: [] });
  for (const user of store.users || []) {
    if (!api.findUserById(user.id) && !api.findUserByUsername(user.username)) api.insertUser(user);
  }
}

function migrateProfiles(api, localDir) {
  const store = readJson(join(localDir, "profiles.json"), { users: {} });
  api.writeProfilesStore(store);
}

function migrateFavorites(api, localDir) {
  api.writeFavoritesStore(readJson(join(localDir, "favorites.json"), { users: {} }));
}

function migrateEventNotes(api, localDir) {
  api.writeEventNotesStore(readJson(join(localDir, "event-notes.json"), { users: {} }));
}

function migrateInteractions(api, localDir) {
  api.writeInteractionsStore(readJson(join(localDir, "interactions.json"), { questions: [], corrections: [] }));
}

function migrateEventExtras(api, localDir) {
  const store = readJson(join(localDir, "event-extras.json"), { events: {} });
  api.writeLocalEventExtrasStore(store);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
