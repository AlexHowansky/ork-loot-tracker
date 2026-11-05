import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/server/db/client.ts";

const DRIZZLE = join(import.meta.dir, "../drizzle");
let dir = "";

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

/** A copy of the migrations folder holding only those before `tag`. */
function migrationsBefore(tag: string): string {
  const folder = join(dir, "drizzle");
  cpSync(DRIZZLE, folder, { recursive: true });
  const path = join(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(path, "utf8"));
  const at = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
  expect(at).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, at);
  writeFileSync(path, JSON.stringify(journal));
  return folder;
}

test("0004 gives each existing campaign its GM and keeps its contents", () => {
  dir = mkdtempSync(join(tmpdir(), "phat-loot-migrate-"));
  const dbPath = join(dir, "app.db");
  openDb(dbPath, migrationsBefore("0004_campaign_gm"));

  const old = new Database(dbPath);
  const now = Date.now();
  old.run("INSERT INTO gm (id, email, password_hash, created_at) VALUES ('g1', 'a@x.test', 'h', ?)", [now]);
  old.run(
    "INSERT INTO campaign (id, gm_id, name, start_date, created_at, updated_at) " +
      "VALUES ('c1', 'g1', 'Runelords', '2026-01-05', ?, ?)",
    [now, now],
  );
  old.run("INSERT INTO character (id, campaign_id, name, created_at) VALUES ('ch1', 'c1', 'Amiri', ?)", [now]);
  old.run("INSERT INTO session (campaign_id, date, created_at) VALUES ('c1', '2026-01-05', ?)", [now]);
  old.close();

  openDb(dbPath, DRIZZLE);
  const db = new Database(dbPath);
  expect(db.query("SELECT campaign_id, gm_id FROM campaign_gm").all()).toEqual([
    { campaign_id: "c1", gm_id: "g1" },
  ]);
  expect(db.query("SELECT name FROM campaign").all()).toEqual([{ name: "Runelords" }]);
  expect(db.query("SELECT name FROM character").all()).toEqual([{ name: "Amiri" }]);
  expect(db.query("SELECT count(*) AS n FROM session").get()).toEqual({ n: 1 });
  const cols = db.query("PRAGMA table_info(campaign)").all() as { name: string }[];
  expect(cols.map((c) => c.name)).not.toContain("gm_id");
  db.close();
});
