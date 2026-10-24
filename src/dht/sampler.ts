import { randomBytes } from "node:crypto";
import type DHT from "bittorrent-dht";
import type { PeerAddress } from "bittorrent-dht";
import type { CatalogueStore } from "../catalogue/store.js";
import type { HashSighting } from "./harvester.js";

// BEP 51 (DHT Infohash Indexing): actively ask nodes for samples of the
// info hashes they store. Everything is outgoing, so it works behind NAT.
// https://bittorrent.org/beps/bep_0051.html

/** The parts of bittorrent-dht's private k-rpc instance we use. */
interface KRpc {
  query(
    node: PeerAddress,
    message: { q: string; a: Record<string, unknown> },
    cb: (err: Error | null, res?: { r?: Record<string, unknown> }) => void,
  ): void;
  pending: unknown[];
  socket: { inflight: number };
}

export interface SamplerOptions {
  /** Queries sent per second (default 10). */
  queriesPerSecond?: number;
  /** Max queries waiting or in flight before we hold off (default 32). */
  maxInflight?: number;
  /** Max nodes queued for a visit (default 10000). */
  maxFrontier?: number;
  /** Never revisit a node sooner than this, even if it allows it (default 5 min). */
  minRevisitMs?: number;
  /**
   * Checked before every query; return true to hold off, e.g. while the
   * fetch queue is full, so sampling doesn't take query slots from the
   * lookups that turn hashes into catalogue entries.
   */
  shouldPause?: () => boolean;
}

export interface SamplerCounts {
  queries: number;
  replies: number;
  /** Replies without a `samples` field: node doesn't support BEP 51. */
  unsupported: number;
  /** Timeouts and error replies. */
  errors: number;
  /** Info hashes received in samples. */
  samples: number;
  /** Samples skipped because the hash is already catalogued. */
  known: number;
}

export interface Sampler {
  readonly counts: SamplerCounts;
  /** Nodes currently queued for a visit. */
  frontierSize(): number;
  stop(): void;
}

// The spec caps `interval` at 6 hours.
const MAX_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ERROR_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Crawl the DHT with sample_infohashes queries, starting from our routing
 * table and spreading out through the `nodes` each reply returns. Every
 * sampled hash not already in the catalogue goes to `onSighting`.
 */
export function startSampler(
  dht: DHT,
  store: Pick<CatalogueStore, "has">,
  onSighting: (sighting: HashSighting) => void,
  {
    queriesPerSecond = 10,
    maxInflight = 32,
    maxFrontier = 10_000,
    minRevisitMs = 5 * 60 * 1000,
    shouldPause,
  }: SamplerOptions = {},
): Sampler {
  const rpc = (dht as unknown as { _rpc: KRpc })._rpc;
  const counts: SamplerCounts = {
    queries: 0,
    replies: 0,
    unsupported: 0,
    errors: 0,
    samples: 0,
    known: 0,
  };

  const frontier: PeerAddress[] = [];
  const queued = new Set<string>();
  /** host:port → earliest time we may query it again. */
  const nextVisit = new Map<string, number>();

  const enqueue = (node: PeerAddress) => {
    const key = `${node.host}:${node.port}`;
    if (queued.has(key) || frontier.length >= maxFrontier) return;
    if ((nextVisit.get(key) ?? 0) > Date.now()) return;
    queued.add(key);
    frontier.push({ host: node.host, port: node.port });
  };

  const seedFromRoutingTable = () => {
    for (const node of dht.nodes.toArray()) enqueue(node);
  };

  const onReply = (
    key: string,
    err: Error | null,
    r?: Record<string, unknown>,
  ) => {
    const now = Date.now();
    if (err || !r) {
      counts.errors++;
      nextVisit.set(key, now + ERROR_BACKOFF_MS);
      return;
    }
    counts.replies++;

    // The spec says supporting nodes always send `samples`, even empty.
    const samples = r.samples;
    if (!Buffer.isBuffer(samples)) {
      counts.unsupported++;
      nextVisit.set(key, now + MAX_INTERVAL_MS);
    } else {
      const interval =
        typeof r.interval === "number" ? r.interval * 1000 : MAX_INTERVAL_MS;
      nextVisit.set(
        key,
        now + Math.min(Math.max(interval, minRevisitMs), MAX_INTERVAL_MS),
      );
      for (let i = 0; i + 20 <= samples.length; i += 20) {
        counts.samples++;
        const infoHash = samples.subarray(i, i + 20).toString("hex");
        if (store.has(infoHash)) counts.known++;
        else onSighting({ infoHash, source: "sample_infohashes" });
      }
    }

    if (Buffer.isBuffer(r.nodes)) {
      for (const node of parseCompactNodes(r.nodes)) enqueue(node);
    }
  };

  const tick = () => {
    if (shouldPause?.()) return;
    // Counts everyone's queries, so sampling also yields to busy lookups.
    if (rpc.socket.inflight + rpc.pending.length >= maxInflight) return;
    if (frontier.length === 0) seedFromRoutingTable();
    const node = frontier.shift();
    if (!node) return;
    const key = `${node.host}:${node.port}`;
    queued.delete(key);
    // Block re-queuing while the query is in flight; onReply sets the
    // real revisit time.
    nextVisit.set(key, Date.now() + minRevisitMs);

    counts.queries++;
    rpc.query(
      node,
      { q: "sample_infohashes", a: { target: randomBytes(20) } },
      (err, res) => onReply(key, err, res?.r),
    );
  };

  // Drop expired revisit entries so the map doesn't grow forever.
  const prune = () => {
    const now = Date.now();
    for (const [key, at] of nextVisit) if (at <= now) nextVisit.delete(key);
  };

  const timer = setInterval(tick, 1000 / queriesPerSecond);
  const pruneTimer = setInterval(prune, 10 * 60 * 1000);
  timer.unref();
  pruneTimer.unref();

  const stop = () => {
    clearInterval(timer);
    clearInterval(pruneTimer);
  };
  dht.once("close", stop);

  return { counts, frontierSize: () => frontier.length, stop };
}

/** Decode BEP 5 compact node info: 20-byte ID, 4-byte IPv4, 2-byte port. */
function parseCompactNodes(buf: Buffer): PeerAddress[] {
  const nodes: PeerAddress[] = [];
  for (let i = 0; i + 26 <= buf.length; i += 26) {
    const port = buf.readUInt16BE(i + 24);
    if (port === 0) continue;
    const host = `${buf[i + 20]}.${buf[i + 21]}.${buf[i + 22]}.${buf[i + 23]}`;
    nodes.push({ host, port });
  }
  return nodes;
}
