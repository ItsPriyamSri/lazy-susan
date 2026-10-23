import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/profile.js";

const file = (contents: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "ls-profile-"));
  const path = join(dir, "profile.json");
  writeFileSync(path, contents);
  return path;
};

describe("the details that are not in a document", () => {
  it("reads keys this project knows", () => {
    const path = file(JSON.stringify({ "person.phone.mobile": " +91 98200 11223 " }));
    const load = loadProfile(path, "2026-10-22T00:00:00.000Z");

    expect(load.found).toBe(true);
    expect(load.facts).toHaveLength(1);
    expect(load.facts[0]).toEqual({
      key: "person.phone.mobile",
      value: "+91 98200 11223",
      source: { kind: "attested", at: "2026-10-22T00:00:00.000Z", formId: "profile", by: "human" },
    });
  });

  it("refuses a key it does not know instead of smuggling it into a form", () => {
    const path = file(JSON.stringify({ "person.phone.mobile": "123", "favourite.colour": "blue" }));
    const load = loadProfile(path);

    expect(load.facts.map((f) => f.key)).toEqual(["person.phone.mobile"]);
    expect(load.ignored).toEqual(["favourite.colour"]);
  });

  it("ignores empty values and non-strings", () => {
    const path = file(JSON.stringify({ "person.email": "  ", "person.full_name": 42 }));
    const load = loadProfile(path);

    expect(load.facts).toEqual([]);
    expect(load.ignored).toEqual(["person.email", "person.full_name"]);
  });

  it("says it found nothing when there is no file", () => {
    const load = loadProfile("/nonexistent/profile.json");
    expect(load).toEqual({ facts: [], ignored: [], found: false });
  });

  it("rejects a file that is not an object of key: value pairs", () => {
    expect(() => loadProfile(file(JSON.stringify([1, 2, 3])))).toThrow(/object of key/);
  });
});
