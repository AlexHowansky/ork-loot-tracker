import { and, eq } from "drizzle-orm";
import type { DbOrTx as Db } from "../db/client.ts";
import { campaign, campaignGm, cashEntry } from "../db/schema.ts";
import { requireGm } from "../lib/auth.ts";
import { badRequest, notFound } from "../lib/errors.ts";
import { idParam, readJson, uuidParam, type Router } from "../lib/http.ts";
import { logger } from "../lib/logger.ts";
import { assertMoneyInRange, campaignSession, ownedCampaign } from "../domain/campaign.ts";
import { formatMoney } from "../../shared/money.ts";
import { cashEntrySchema, cashEntryUpdateSchema } from "../../shared/schemas.ts";

/** A hand-written ledger entry in a campaign `gmId` runs; else a 404. */
function ownedEntry(db: Db, gmId: string, entryId: number) {
  const row = db
    .select({ entry: cashEntry, campaign })
    .from(cashEntry)
    .innerJoin(campaign, eq(campaign.id, cashEntry.campaignId))
    .innerJoin(campaignGm, and(eq(campaignGm.campaignId, campaign.id), eq(campaignGm.gmId, gmId)))
    .where(eq(cashEntry.id, entryId))
    .get();
  if (!row) throw notFound("That cash entry");
  if (row.entry.splitId !== null) {
    throw badRequest(
      "That entry was made by a loot split. Undo the split to remove it.",
    );
  }
  return row;
}

/**
 * Moves cash by `change`, refusing to take it below zero or the
 * campaign past what it can record. Reads the balance inside the caller's
 * transaction, so it can't race another write.
 */
function adjustCash(tx: Db, campaignId: string, change: number) {
  const c = tx.select().from(campaign).where(eq(campaign.id, campaignId)).get();
  if (!c) throw notFound("That campaign");
  if (c.cash + change < 0) {
    const money = (n: number) => formatMoney(n, c.currencyDecimals, c.currencyLabel);
    throw badRequest(
      `Cash only holds ${money(c.cash)}, so it can't pay out ` +
        `${money(-change)}.`,
      { amount: "That's more than cash holds." },
    );
  }
  tx.update(campaign)
    .set({ cash: c.cash + change })
    .where(eq(campaign.id, campaignId))
    .run();
  if (change > 0) assertMoneyInRange(tx, campaignId, "amount");
}

export function cashRoutes(r: Router) {
  r.post("/api/campaigns/:id/cash", async (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    const input = await readJson(ctx, cashEntrySchema);
    const row = ctx.db.transaction((tx) => {
      const { date } = campaignSession(tx, c.id, input.sessionId);
      adjustCash(tx, c.id, input.amount);
      return tx
        .insert(cashEntry)
        .values({ ...input, date, campaignId: c.id })
        .returning()
        .get();
    });
    ctx.changed(c.id);
    logger.info("cash entry added", {
      requestId: ctx.requestId,
      campaignId: c.id,
      entryId: row.id,
      amount: row.amount,
    });
    return { id: row.id };
  });

  r.patch("/api/cash/:id", async (ctx) => {
    const { entry } = ownedEntry(ctx.db, requireGm(ctx).id, idParam(ctx));
    const input = await readJson(ctx, cashEntryUpdateSchema);
    if (input.sessionId === null && entry.sessionId !== null) {
      throw badRequest("Choose a session for this entry.", { sessionId: "Choose a session." });
    }
    ctx.db.transaction((tx) => {
      const date =
        input.sessionId === null ? entry.date : campaignSession(tx, entry.campaignId, input.sessionId).date;
      adjustCash(tx, entry.campaignId, input.amount - entry.amount);
      tx.update(cashEntry).set({ ...input, date }).where(eq(cashEntry.id, entry.id)).run();
    });
    ctx.changed(entry.campaignId);
    logger.info("cash entry changed", {
      requestId: ctx.requestId,
      entryId: entry.id,
      amount: input.amount,
    });
    return { id: entry.id };
  });

  r.delete("/api/cash/:id", (ctx) => {
    const { entry } = ownedEntry(ctx.db, requireGm(ctx).id, idParam(ctx));
    ctx.db.transaction((tx) => {
      adjustCash(tx, entry.campaignId, -entry.amount);
      tx.delete(cashEntry).where(eq(cashEntry.id, entry.id)).run();
    });
    ctx.changed(entry.campaignId);
    logger.info("cash entry deleted", { requestId: ctx.requestId, entryId: entry.id });
    return { ok: true };
  });
}
