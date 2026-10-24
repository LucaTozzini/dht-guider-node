import { createHash } from "node:crypto";
import bencode from "bencode";
import { describe, expect, it } from "vitest";
import { parseInfoDict } from "../src/metadata/parse.js";

const info = bencode.encode({
  name: "Big Buck Bunny",
  "piece length": 16384,
  length: 1000,
  pieces: new Uint8Array(20),
});
const infoHash = createHash("sha1").update(info).digest("hex");

describe("parseInfoDict", () => {
  it("returns the name of metadata that matches the info hash", () => {
    expect(parseInfoDict(info, infoHash)).toBe("Big Buck Bunny");
  });

  it("rejects metadata that doesn't match the info hash", () => {
    const tampered = bencode.encode({ name: "Something Else", length: 1000 });
    expect(() => parseInfoDict(tampered, infoHash)).toThrow("hash_mismatch");
  });
});
