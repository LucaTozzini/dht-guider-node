import { describe, expect, it } from "vitest";
import { createNameFilter } from "../src/metadata/filter.js";

describe("createNameFilter", () => {
  it("blocks names containing a listed word, in any case", () => {
    const isBlocked = createNameFilter(["XXX"]);
    expect(isBlocked("Hot.Body.XXX.1080p")).toBe(true);
    expect(isBlocked("xxx_clip.mp4")).toBe(true);
    expect(isBlocked("Maxxxine (2024)")).toBe(false);
  });
});
