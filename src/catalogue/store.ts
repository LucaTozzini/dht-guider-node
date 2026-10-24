import type { CatalogueDb } from "./db.js";

export interface CatalogueItem {
  /** 40-char hex info hash. */
  infoHash: string;
  name: string;
  /** Unix ms when the metadata was fetched and verified. */
  addedAt: number;
}

export interface CatalogueStore {
  /** Whether the catalogue already has this info hash. */
  has(infoHash: string): boolean;
  /** Save a verified torrent. Returns false if it was already stored. */
  add(item: CatalogueItem): boolean;
  /** Number of torrents in the catalogue. */
  count(): number;
}

export function createStore(db: CatalogueDb): CatalogueStore {
  const hasStmt = db
    .prepare<[string], 1>("SELECT 1 FROM catalogue WHERE info_hash = ?")
    .pluck();
  const addStmt = db.prepare<[string, string, number]>(
    "INSERT OR IGNORE INTO catalogue (info_hash, name, added_at) VALUES (?, ?, ?)",
  );
  const countStmt = db
    .prepare<[], number>("SELECT COUNT(*) FROM catalogue")
    .pluck();

  return {
    has: (infoHash) => hasStmt.get(infoHash.toLowerCase()) !== undefined,
    add: ({ infoHash, name, addedAt }) =>
      addStmt.run(infoHash.toLowerCase(), name, addedAt).changes > 0,
    count: () => countStmt.get() ?? 0,
  };
}
