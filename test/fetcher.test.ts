import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";
import bencode from "bencode";
import Wire from "bittorrent-protocol";
import utMetadata from "ut_metadata";
import { afterEach, describe, expect, it } from "vitest";
import { fetchMetadata } from "../src/metadata/fetcher.js";

const info = bencode.encode({
  name: "Big Buck Bunny",
  "piece length": 16384,
  length: 1000,
  pieces: new Uint8Array(20),
});
const infoHash = createHash("sha1").update(info).digest("hex");

let server: Server | undefined;
afterEach(() => server?.close());

/** A local peer that serves `info` over BEP 9, answering as `echoHash`. */
function startSeeder(echoHash: string): Promise<number> {
  server = createServer((socket) => {
    const wire = new Wire("tcpIncoming");
    socket.pipe(wire).pipe(socket);
    wire.on("error", () => {});
    wire.use(utMetadata(info));
    wire.on("handshake", () => wire.handshake(echoHash, Buffer.alloc(20, 7)));
  });
  return new Promise((resolve) =>
    server!.listen(0, "127.0.0.1", () => {
      const addr = server!.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    }),
  );
}

describe("fetchMetadata", () => {
  it("downloads and verifies a torrent's name from a peer", async () => {
    const port = await startSeeder(infoHash);
    await expect(
      fetchMetadata(infoHash, { host: "127.0.0.1", port }),
    ).resolves.toBe("Big Buck Bunny");
  });

  it("rejects a peer that answers for a different torrent", async () => {
    const port = await startSeeder("11".repeat(20));
    await expect(
      fetchMetadata(infoHash, { host: "127.0.0.1", port }),
    ).rejects.toMatchObject({ reason: "wrong_torrent" });
  });
});
