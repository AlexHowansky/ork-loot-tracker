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
  if (path !== ":memory:") sqlite.run("PRAGMA journal_mode = WAL");
  const db = drizzle({ client: sqlite, schema });
  // Migrations that rebuild a table drop the old one, which would cascade
  // into its children. The pragma is a no-op inside the migrator's
  // transaction, so it has to be off around it, then checked afterwards.
  sqlite.run("PRAGMA foreign_keys = OFF");
  migrate(db, { migrationsFolder });
  const broken = sqlite.query("PRAGMA foreign_key_check").all();
  if (broken.length > 0) {
    logger.error("foreign key violations after migrating", { broken });
    throw new Error("The database failed its integrity check after migrating.");
  }
  sqlite.run("PRAGMA foreign_keys = ON");
  logger.debug("database ready", { path });
  return db;
}

/** A transaction handle; most query helpers accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
