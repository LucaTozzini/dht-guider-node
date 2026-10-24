import { EventEmitter } from "node:events";
import type DHT from "bittorrent-dht";
import type { PeerAddress } from "bittorrent-dht";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HashSighting } from "../src/dht/harvester.js";
import { startSampler } from "../src/dht/sampler.js";

afterEach(() => vi.useRealTimers());

/** BEP 5 compact node info: 20-byte ID, 4-byte IPv4, 2-byte port. */
function compactNode(host: string, port: number): Buffer {
  const buf = Buffer.alloc(26);
  host.split(".").forEach((octet, i) => (buf[20 + i] = Number(octet)));
  buf.writeUInt16BE(port, 24);
  return buf;
}

describe("startSampler", () => {
  it("turns sample_infohashes replies into sightings and crawls the returned nodes", () => {
    vi.useFakeTimers();
    const seed = { host: "10.0.0.1", port: 6881 };
    const next = { host: "10.0.0.2", port: 6881 };
    const hashA = Buffer.alloc(20, 0xaa);
    const hashB = Buffer.alloc(20, 0xbb);

    // Every node replies with the same two samples and points to `next`.
    const queried: PeerAddress[] = [];
    const rpc = {
      pending: [],
      socket: { inflight: 0 },
      query: (node: PeerAddress, _msg: unknown, cb: Function) => {
        queried.push(node);
        cb(null, {
          r: {
            samples: Buffer.concat([hashA, hashB]),
            interval: 3600,
            nodes: compactNode(next.host, next.port),
          },
        });
      },
    };
    const dht = Object.assign(new EventEmitter(), {
      _rpc: rpc,
      nodes: { toArray: () => [seed], count: () => 1 },
    }) as unknown as DHT;

    const seen: HashSighting[] = [];
    const sampler = startSampler(
      dht,
      { has: () => false },
      (s) => seen.push(s),
      {
        queriesPerSecond: 10,
      },
    );
    vi.advanceTimersByTime(250);
    sampler.stop();

    expect(seen.map((s) => s.infoHash)).toEqual([
      hashA.toString("hex"),
      hashB.toString("hex"),
      hashA.toString("hex"),
      hashB.toString("hex"),
    ]);
    expect(seen.every((s) => s.source === "sample_infohashes")).toBe(true);
    // First the routing table's node, then the one its reply pointed to.
    expect(queried).toEqual([seed, next]);
  });
});
