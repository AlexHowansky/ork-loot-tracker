import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.ts";
import { logger } from "../lib/logger.ts";

export type Db = BunSQLiteDatabase<typeof schema>;

/**
 * Opens (creating if needed) and migrates the database at `path`. Entry
 * points pass `migrationsFolder` from the project root, since a bundled build
 * puts this module in a different place than the source tree does.
 */
export function openDb(
  path: string,
  migrationsFolder = join(import.meta.dir, "../../../drizzle"),
): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.run("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") sqlite.run("PRAGMA journal_mode = WAL");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder });
  logger.debug("database ready", { path });
  return db;
}

/** A transaction handle; most query helpers accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
