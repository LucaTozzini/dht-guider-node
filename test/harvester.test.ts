import { EventEmitter } from "node:events";
import type DHT from "bittorrent-dht";
import { describe, expect, it } from "vitest";
import { type HashSighting, startHarvester } from "../src/dht/harvester.js";

describe("startHarvester", () => {
  it("forwards new info hashes and skips catalogued ones", () => {
    const dht = new EventEmitter() as unknown as DHT;
    const known = Buffer.alloc(20, 0xaa);
    const fresh = Buffer.alloc(20, 0xbb);
    const store = { has: (h: string) => h === known.toString("hex") };
    const seen: HashSighting[] = [];
    startHarvester(dht, store, (s) => seen.push(s));

    const peer = { host: "1.2.3.4", port: 5000 };
    dht.emit("announce", peer, fresh, peer);
    dht.emit("get_peers", known);

    expect(seen).toEqual([
      { infoHash: fresh.toString("hex"), source: "announce_peer", peer },
    ]);
  });
});
