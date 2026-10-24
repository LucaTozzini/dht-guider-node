import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import type { PeerAddress } from "bittorrent-dht";
import Wire from "bittorrent-protocol";
import utMetadata, { type UtMetadata } from "ut_metadata";
import { MetadataError, parseInfoDict } from "./parse.js";

export type FetchFailReason =
  | "connect_failed"
  | "timeout"
  | "closed"
  | "wrong_torrent"
  | "no_ut_metadata"
  | "no_metadata"
  | "rejected"
  | MetadataError["reason"];

export class FetchError extends Error {
  constructor(readonly reason: FetchFailReason) {
    super(reason);
  }
}

// Azureus-style peer ID: "-GN0001-" + 12 random bytes, fixed per process.
const PEER_ID = Buffer.concat([Buffer.from("-GN0001-"), randomBytes(12)]);

export interface FetchOptions {
  /** Give up on this peer after this long (default 10s). */
  timeoutMs?: number;
}

/**
 * Connect to one peer over TCP and download the torrent's info dictionary
 * with BEP 9 (ut_metadata). Resolves with the verified torrent name, or
 * rejects with a FetchError saying why.
 */
export function fetchMetadata(
  infoHash: string,
  peer: PeerAddress,
  { timeoutMs = 10_000 }: FetchOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    let connected = false;
    let settled = false;

    const socket = connect({ host: peer.host, port: peer.port });
    const wire = new Wire("tcpOutgoing");
    wire.use(utMetadata());
    const ext = (wire as unknown as { ut_metadata: UtMetadata }).ut_metadata;

    const finish = (err: FetchError | null, name?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wire.destroy();
      socket.destroy();
      if (err) reject(err);
      else resolve(name!);
    };
    const fail = (reason: FetchFailReason) => finish(new FetchError(reason));
    const lost = () => fail(connected ? "closed" : "connect_failed");

    const timer = setTimeout(
      () => fail(connected ? "timeout" : "connect_failed"),
      timeoutMs,
    );

    socket.on("connect", () => (connected = true));
    socket.on("error", lost);
    socket.on("close", lost);
    wire.on("error", lost);
    socket.pipe(wire).pipe(socket);

    // The peer must echo our info hash; anything else is the wrong torrent.
    wire.on("handshake", (peerHash, _peerId, extensions) => {
      if (peerHash !== infoHash) fail("wrong_torrent");
      else if (!extensions.extended) fail("no_ut_metadata");
    });

    // ut_metadata only hears about the extended handshake if the peer
    // advertises it, so catch peers that don't here instead of timing out.
    wire.on("extended", (ext, handshake) => {
      if (ext !== "handshake") return;
      const m = (handshake as { m?: Record<string, unknown> }).m;
      if (!m?.ut_metadata) fail("no_ut_metadata");
    });

    ext.on("warning", (err) => fail(classifyWarning(err.message)));
    ext.on("metadata", () => {
      // ut_metadata verifies against the hash the *peer* echoed; check
      // against our own hash too, on the raw bytes.
      try {
        finish(null, parseInfoDict(ext.metadata!, infoHash));
      } catch (err) {
        fail(err instanceof MetadataError ? err.reason : "malformed");
      }
    });

    ext.fetch();
    wire.handshake(infoHash, PEER_ID, { dht: true });
  });
}

/** Map ut_metadata's warning messages to failure reasons. */
function classifyWarning(message: string): FetchFailReason {
  if (message.includes("does not support ut_metadata")) return "no_ut_metadata";
  if (message.includes("does not have metadata")) return "no_metadata";
  if (message.includes("reject")) return "rejected";
  if (message.includes("invalid metadata size")) return "malformed";
  if (message.includes("invalid metadata")) return "hash_mismatch";
  return "malformed";
}
