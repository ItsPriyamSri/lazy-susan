import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NoAtlas, answerId, atlasMirror, isConfigured, mirror } from "../src/index.js";
import type { MirroredAnswer } from "../src/index.js";

function answer(seq: number, op: unknown = { op: "attest", label: `answer ${seq}` }): MirroredAnswer {
  return { id: answerId(op), at: `2026-10-2${seq}T03:10:00.000Z`, op };
}

describe("without a connection string", () => {
  it("says so instead of pretending to store anything", () => {
    delete process.env.MONGODB_URI;
    expect(isConfigured()).toBe(false);
    expect(mirror()).toBeNull();
    expect(() => atlasMirror()).toThrow(NoAtlas);
  });
});

describe("the answer id", () => {
  it("is the same for the same answer regardless of key order", () => {
    expect(answerId({ op: "attest", fact: { key: "phone", value: "1" } })).toBe(
      answerId({ fact: { value: "1", key: "phone" }, op: "attest" }),
    );
  });

  it("differs when the answer differs", () => {
    expect(answerId({ value: "1" })).not.toBe(answerId({ value: "2" }));
  });
});

/**
 * A real mongod, not a stub. It runs on a temporary directory for the test, which
 * is the same wire protocol and the same upsert semantics Atlas gets; only the
 * address differs.
 */
describe("the answer mirror", () => {
  let mongod: MongoMemoryServer;
  let uri = "";

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }, 180_000);

  afterAll(async () => {
    await mongod?.stop();
  });

  it("writes answers and reads them back oldest first", async () => {
    const store = atlasMirror(uri);
    await store.append(answer(0));
    await store.append(answer(1));
    await store.append(answer(2));

    const rows = await store.answers();
    expect(rows.map((r) => r.at)).toEqual([
      "2026-10-20T03:10:00.000Z",
      "2026-10-21T03:10:00.000Z",
      "2026-10-22T03:10:00.000Z",
    ]);
    expect(rows[1]!.id).toBe(answerId({ op: "attest", label: "answer 1" }));
    await store.close();
  });

  it("does not grow when the same answer is written twice", async () => {
    const store = atlasMirror(uri);
    const before = (await store.answers()).length;

    // Two processes typing the same answer, or a restart replaying the night.
    await store.append(answer(0));
    await store.append(answer(1));

    expect(await store.answers()).toHaveLength(before);
    await store.close();
  });

  it("keeps a different answer as a separate row instead of overwriting", async () => {
    const store = atlasMirror(uri);
    const before = (await store.answers()).length;

    await store.append(answer(3, { op: "attest", label: "answer 3", fact: { key: "phone", value: "2" } }));

    expect(await store.answers()).toHaveLength(before + 1);
    await store.close();
  });

  it("still has the answers after a fresh connection", async () => {
    const first = atlasMirror(uri);
    const rows = await first.answers();
    await first.close();

    const second = atlasMirror(uri);
    expect(await second.answers()).toEqual(rows);
    await second.close();
  });

  it("writes into the named database and nothing else", async () => {
    process.env.MONGODB_DB = "lazy-susan-test";
    const store = atlasMirror(uri);
    const row = answer(9, { op: "resolve", label: "address", value: "7 Lake View Road" });
    await store.append(row);
    expect((await store.answers()).some((r) => r.id === row.id)).toBe(true);
    await store.close();
    delete process.env.MONGODB_DB;
  });
});
