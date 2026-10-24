import { describe, expect, it } from "vitest";
import { openCatalogue } from "../src/catalogue/db.js";
import { createStore } from "../src/catalogue/store.js";

describe("catalogue store", () => {
  it("stores each info hash once", () => {
    const store = createStore(openCatalogue(":memory:"));
    const item = { infoHash: "ab".repeat(20), name: "Example", addedAt: 1 };

    expect(store.has(item.infoHash)).toBe(false);
    expect(store.add(item)).toBe(true);
    expect(store.add({ ...item, name: "Other" })).toBe(false);
    expect(store.has(item.infoHash)).toBe(true);
    expect(store.count()).toBe(1);
  });
});
