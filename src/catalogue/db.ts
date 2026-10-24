import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type CatalogueDb = Database.Database;

// Kept inline rather than in a .sql file so `tsc` builds don't need to
// copy assets into dist/.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS catalogue (
    info_hash TEXT    PRIMARY KEY,  -- 40-char lowercase hex SHA-1 of the info dict
    name      TEXT    NOT NULL,     -- file name (single-file) or top-level folder (multi-file)
    added_at  INTEGER NOT NULL      -- unix ms when the metadata was fetched and verified
  ) STRICT, WITHOUT ROWID;
`;

/**
 * Open (or create) the catalogue database and apply the schema.
 * Pass ":memory:" for a throwaway database, e.g. in tests.
 */
export function openCatalogue(file: string): CatalogueDb {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  // WAL lets the crawler keep writing while another process (a stats
  // script, the sqlite3 CLI) reads the same file.
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
