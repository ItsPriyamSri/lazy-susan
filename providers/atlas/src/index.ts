import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";

/**
 * The answers travel; the documents do not.
 *
 * Everything in this app either came from a file in your folder or from a line
 * you typed. The files are re-read on whatever machine you open the folder on.
 * The lines you typed are the part worth carrying, so that is the part stored
 * off-machine: a small collection of answers, each keyed by its own content.
 *
 * With no connection string the app keeps working and the answers stay on the
 * disk they were written to.
 */

export interface MirroredAnswer {
  /** Content hash of the operation, so the same answer is stored once. */
  id: string;
  at: string;
  /** The journal operation, unchanged. */
  op: unknown;
}

export interface JournalMirror {
  readonly kind: "atlas";
  /** Writes an answer, or does nothing if that exact answer is already stored. */
  append(answer: MirroredAnswer): Promise<void>;
  /** Every stored answer, oldest first. */
  answers(): Promise<MirroredAnswer[]>;
  close(): Promise<void>;
}

export class NoAtlas extends Error {
  constructor() {
    super("MONGODB_URI is not set; answers stay on this disk");
    this.name = "NoAtlas";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export function databaseName(): string {
  return process.env.MONGODB_DB ?? "lazy-susan";
}

/** Key order should not decide whether two answers are the same. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}

export function answerId(op: unknown): string {
  return createHash("sha256").update(stable(op)).digest("hex");
}

export function atlasMirror(uri: string | undefined = process.env.MONGODB_URI): JournalMirror {
  if (!uri) throw new NoAtlas();
  // Narrowed once, so the closures below cannot see an undefined address.
  const address = uri;

  let client: MongoClient | null = null;

  async function collection() {
    if (!client) {
      client = new MongoClient(address, { serverSelectionTimeoutMS: 8_000 });
      await client.connect();
    }
    return client.db(databaseName()).collection<MirroredAnswer & { _id: string; mirroredAt: string }>("answers");
  }

  return {
    kind: "atlas",

    async append(answer: MirroredAnswer): Promise<void> {
      const rows = await collection();
      await rows.updateOne(
        { _id: answer.id },
        { $setOnInsert: { ...answer, _id: answer.id, mirroredAt: new Date().toISOString() } },
        { upsert: true },
      );
    },

    async answers(): Promise<MirroredAnswer[]> {
      const rows = await collection();
      const found = await rows
        .find({}, { projection: { _id: 0, mirroredAt: 0 } })
        .sort({ at: 1 })
        .toArray();
      return found.map((row) => ({ id: row.id, at: row.at, op: row.op }));
    },

    async close(): Promise<void> {
      if (client) {
        await client.close();
        client = null;
      }
    },
  };
}

/** The mirror when a connection string exists, otherwise nothing at all. */
export function mirror(): JournalMirror | null {
  return isConfigured() ? atlasMirror() : null;
}
