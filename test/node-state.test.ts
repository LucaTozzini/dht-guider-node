import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type DHT from "bittorrent-dht";
import { afterEach, describe, expect, it } from "vitest";
import { saveState } from "../src/dht/node.js";

let dir: string | undefined;
afterEach(() => (dir ? rm(dir, { recursive: true }) : undefined));

describe("saveState", () => {
  it("keeps previously saved nodes when the routing table is nearly empty", async () => {
    dir = await mkdtemp(join(tmpdir(), "gn-state-"));
    const file = join(dir, "dht-state.json");
    const previous = [
      { host: "10.0.0.1", port: 6881 },
      { host: "10.0.0.2", port: 6881 },
    ];
    await writeFile(
      file,
      JSON.stringify({ nodeId: "aa".repeat(20), nodes: previous }),
    );

    // A run that failed to bootstrap: one node in its routing table.
    const current = { host: "10.0.0.3", port: 6881 };
    const dht = {
      nodeId: Buffer.alloc(20, 0xaa),
      toJSON: () => ({ nodes: [current], values: {} }),
    } as unknown as DHT;
    await saveState(dht, file);

    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.nodes).toEqual([current, ...previous]);
  });
});
