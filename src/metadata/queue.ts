import type DHT from "bittorrent-dht";
import type { PeerAddress } from "bittorrent-dht";
import PQueue from "p-queue";
import type { CatalogueStore } from "../catalogue/store.js";
import { findPeers } from "../dht/node.js";
import type { HashSighting } from "../dht/harvester.js";
import { FetchError, type FetchFailReason, fetchMetadata } from "./fetcher.js";

export interface FetchQueueOptions {
  /** Hashes fetched at the same time (default 30). */
  concurrency?: number;
  /** Max hashes waiting; new ones are dropped beyond this (default 2000). */
  maxQueued?: number;
  /** Peers tried per hash before giving up (default 4). */
  peersPerHash?: number;
  /** Per-peer metadata fetch timeout (default 10s). */
  fetchTimeoutMs?: number;
  /** get_peers lookup timeout (default 10s). */
  lookupTimeoutMs?: number;
  /** Don't retry a failed hash for this long (default 1h). */
  failedTtlMs?: number;
}

export type FailReason = FetchFailReason | "no_peers";

export interface FetchQueueCounts {
  /** Sightings accepted into the queue. */
  queued: number;
  /** Skipped: already queued or in progress. */
  duplicate: number;
  /** Skipped: failed recently. */
  recentlyFailed: number;
  /** Dropped: queue full. */
  droppedFull: number;
  /** Fetched, verified and added to the catalogue. */
  fetched: number;
  /** Gave up, by the last peer's failure reason. */
  failed: Partial<Record<FailReason, number>>;
}

export type FetchResult =
  | { ok: true; infoHash: string; name: string; ms: number }
  | { ok: false; infoHash: string; reason: FailReason; ms: number };

export interface FetchQueue {
  readonly counts: FetchQueueCounts;
  /** Offer a sighting. Returns whether it was queued. */
  add(sighting: HashSighting): boolean;
  /** Hashes waiting to start. */
  waiting(): number;
  /** Hashes being fetched right now. */
  running(): number;
  stop(): void;
}

/**
 * Turn sightings into catalogue entries: find peers for each hash, try
 * them in turn, and save the first verified result. Dedupes in-flight
 * hashes and remembers recent failures in memory.
 */
export function createFetchQueue(
  dht: DHT,
  store: Pick<CatalogueStore, "has" | "add">,
  {
    concurrency = 30,
    maxQueued = 2000,
    peersPerHash = 4,
    fetchTimeoutMs = 10_000,
    lookupTimeoutMs = 10_000,
    failedTtlMs = 60 * 60 * 1000,
  }: FetchQueueOptions = {},
  onResult?: (result: FetchResult) => void,
): FetchQueue {
  const queue = new PQueue({ concurrency });
  const counts: FetchQueueCounts = {
    queued: 0,
    duplicate: 0,
    recentlyFailed: 0,
    droppedFull: 0,
    fetched: 0,
    failed: {},
  };

  /** In-flight hashes and the peers we already know for them. */
  const jobs = new Map<string, PeerAddress[]>();
  /** infoHash → time the failure expires. */
  const failedUntil = new Map<string, number>();
  let stopped = false;

  const run = async (infoHash: string) => {
    const start = Date.now();
    const known = jobs.get(infoHash) ?? [];
    let reason: FailReason = "no_peers";
    try {
      let peers = known;
      if (peers.length < peersPerHash) {
        const found = await findPeers(dht, Buffer.from(infoHash, "hex"), {
          timeoutMs: lookupTimeoutMs,
          maxPeers: peersPerHash,
        });
        peers = dedupePeers([...known, ...found]);
      }

      for (const peer of peers.slice(0, peersPerHash)) {
        if (stopped) return;
        try {
          const name = await fetchMetadata(infoHash, peer, {
            timeoutMs: fetchTimeoutMs,
          });
          store.add({ infoHash, name, addedAt: Date.now() });
          counts.fetched++;
          onResult?.({ ok: true, infoHash, name, ms: Date.now() - start });
          return;
        } catch (err) {
          reason = err instanceof FetchError ? err.reason : "malformed";
        }
      }

      counts.failed[reason] = (counts.failed[reason] ?? 0) + 1;
      failedUntil.set(infoHash, Date.now() + failedTtlMs);
      onResult?.({ ok: false, infoHash, reason, ms: Date.now() - start });
    } finally {
      jobs.delete(infoHash);
    }
  };

  const add = (sighting: HashSighting): boolean => {
    if (stopped) return false;
    const { infoHash, peer } = sighting;

    const existing = jobs.get(infoHash);
    if (existing) {
      // A later announce can still help a queued hash with a real peer.
      if (peer && existing.length < peersPerHash) existing.push(peer);
      counts.duplicate++;
      return false;
    }
    const until = failedUntil.get(infoHash);
    if (until !== undefined) {
      if (until > Date.now()) {
        counts.recentlyFailed++;
        return false;
      }
      failedUntil.delete(infoHash);
    }
    if (queue.size >= maxQueued) {
      counts.droppedFull++;
      return false;
    }
    // The harvester and sampler check this too, but it may have been
    // fetched since they did.
    if (store.has(infoHash)) return false;

    jobs.set(infoHash, peer ? [peer] : []);
    counts.queued++;
    void queue.add(() => run(infoHash));
    return true;
  };

  // Drop expired failures so the map doesn't grow forever.
  const pruneTimer = setInterval(
    () => {
      const now = Date.now();
      for (const [hash, until] of failedUntil) {
        if (until <= now) failedUntil.delete(hash);
      }
    },
    10 * 60 * 1000,
  );
  pruneTimer.unref();

  return {
    counts,
    add,
    waiting: () => queue.size,
    running: () => queue.pending,
    stop() {
      stopped = true;
      clearInterval(pruneTimer);
      queue.clear();
    },
  };
}

function dedupePeers(peers: PeerAddress[]): PeerAddress[] {
  const seen = new Map<string, PeerAddress>();
  for (const p of peers) seen.set(`${p.host}:${p.port}`, p);
  return [...seen.values()];
}
