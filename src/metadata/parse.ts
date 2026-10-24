import { createHash } from "node:crypto";
import bencode, { type BencodeValue } from "bencode";

export class MetadataError extends Error {
  constructor(readonly reason: "hash_mismatch" | "malformed" | "no_name") {
    super(reason);
  }
}

const utf8 = new TextDecoder("utf-8"); // replaces invalid bytes with U+FFFD

/**
 * Verify a raw bencoded info dictionary against the info hash we asked
 * for, and extract the torrent's name. The info hash is by definition the
 * SHA-1 of these exact bytes, so a match proves the metadata is genuine.
 */
export function parseInfoDict(raw: Uint8Array, infoHash: string): string {
  const digest = createHash("sha1").update(raw).digest("hex");
  if (digest !== infoHash.toLowerCase()) {
    throw new MetadataError("hash_mismatch");
  }

  let info: BencodeValue;
  try {
    info = bencode.decode(raw);
  } catch {
    throw new MetadataError("malformed");
  }
  if (!isDict(info)) throw new MetadataError("malformed");

  // Prefer the explicit UTF-8 name some clients add for older encodings.
  const name = info["name.utf-8"] ?? info.name;
  if (!(name instanceof Uint8Array) || name.length === 0) {
    throw new MetadataError("no_name");
  }
  return utf8.decode(name).trim() || "(unnamed)";
}

function isDict(v: BencodeValue): v is { [key: string]: BencodeValue } {
  return (
    typeof v === "object" && !Array.isArray(v) && !(v instanceof Uint8Array)
  );
}
