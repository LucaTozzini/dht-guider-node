import type DHT from "bittorrent-dht";
import type { PeerAddress } from "bittorrent-dht";
import type { CatalogueStore } from "../catalogue/store.js";

export type HashSource = "announce_peer" | "get_peers" | "sample_infohashes";

/** An info hash seen in DHT traffic that isn't in the catalogue yet. */
export interface HashSighting {
  /** 40-char lowercase hex. */
  infoHash: string;
  source: HashSource;
  /** The peer that announced it; only set for announce_peer. */
  peer?: PeerAddress;
}

export interface HarvesterCounts {
  /** announce_peer messages received. */
  announces: number;
  /** get_peers queries received. */
  getPeers: number;
  /** Sightings skipped because the hash is already catalogued. */
  known: number;
}

export interface Harvester {
  readonly counts: HarvesterCounts;
  /** Stop listening to the DHT. */
  stop(): void;
}

/**
 * Listen to incoming DHT traffic and pass every info hash that isn't
 * already in the catalogue to `onSighting`. Repeats of the same hash are
 * passed on too; deduping in-flight hashes is the fetch queue's job,
 * since it knows what is pending or recently failed.
 */
export function startHarvester(
  dht: DHT,
  store: Pick<CatalogueStore, "has">,
  onSighting: (sighting: HashSighting) => void,
): Harvester {
  const counts: HarvesterCounts = { announces: 0, getPeers: 0, known: 0 };

  const handle = (hash: Buffer, source: HashSource, peer?: PeerAddress) => {
    // Remote input: ignore anything that isn't a 20-byte SHA-1.
    if (!Buffer.isBuffer(hash) || hash.length !== 20) return;
    const infoHash = hash.toString("hex");
    if (store.has(infoHash)) {
      counts.known++;
      return;
    }
    onSighting(peer ? { infoHash, source, peer } : { infoHash, source });
  };

  const onAnnounce = (peer: PeerAddress, infoHash: Buffer) => {
    counts.announces++;
    handle(infoHash, "announce_peer", { host: peer.host, port: peer.port });
  };

  const onGetPeers = (infoHash: Buffer) => {
    counts.getPeers++;
    handle(infoHash, "get_peers");
  };

  dht.on("announce", onAnnounce);
  dht.on("get_peers", onGetPeers);

  return {
    counts,
    stop() {
      dht.off("announce", onAnnounce);
      dht.off("get_peers", onGetPeers);
    },
  };
}
