// Hand-written typings for the parts of bittorrent-dht we use.
// Source of truth: node_modules/bittorrent-dht/client.js (v11).
declare module "bittorrent-dht" {
  import { EventEmitter } from "node:events";
  import type { AddressInfo } from "node:net";

  export interface PeerAddress {
    host: string;
    port: number;
  }

  export interface DHTNode extends PeerAddress {
    id?: Buffer;
  }

  export interface DHTOptions {
    /** 20-byte node ID, as a Buffer or hex string. Random if omitted. */
    nodeId?: Buffer | string;
    /** "host:port" strings or addresses. `false` skips bootstrapping. */
    bootstrap?: Array<string | PeerAddress> | false;
    /** Our public IP, used when announcing ourselves. */
    host?: string | false;
    /** Max info hashes kept in the peer store (default 10000). */
    maxPeers?: number;
    /** Max age of stored peers in ms (default 0 = forever). */
    maxAge?: number;
    concurrency?: number;
    timeBucketOutdated?: number;
  }

  export interface DHTState {
    nodes: PeerAddress[];
    values: Record<string, unknown>;
  }

  export interface DHTEvents {
    ready: [];
    listening: [];
    close: [];
    error: [err: Error];
    warning: [err: Error];
    node: [node: DHTNode];
    /** A peer found by our own lookup() for infoHash. */
    peer: [peer: PeerAddress, infoHash: Buffer, from: PeerAddress | null];
    /** A peer announced infoHash to us (token already validated). */
    announce: [peer: PeerAddress, infoHash: Buffer, from: PeerAddress];
    announce_peer: [infoHash: Buffer, from: PeerAddress];
    /** Someone asked us for peers of infoHash. */
    get_peers: [infoHash: Buffer];
    find_node: [target: Buffer];
  }

  export default class DHT extends EventEmitter<DHTEvents> {
    constructor(opts?: DHTOptions);
    readonly nodeId: Buffer;
    readonly listening: boolean;
    readonly destroyed: boolean;
    readonly ready?: boolean;
    readonly nodes: { count(): number; toArray(): DHTNode[] };
    listen(port?: number, address?: string, onlistening?: () => void): void;
    address(): AddressInfo;
    addNode(node: DHTNode): void;
    removeNode(id: Buffer | string): void;
    lookup(
      infoHash: Buffer | string,
      cb?: (err: Error | null, nodesVisited?: number) => void,
    ): () => void;
    announce(
      infoHash: Buffer | string,
      port?: number,
      cb?: (err: Error | null) => void,
    ): void;
    toJSON(): DHTState;
    destroy(cb?: () => void): void;
  }
}
