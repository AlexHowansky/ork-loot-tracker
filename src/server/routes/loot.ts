import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { campaign, campaignGm, character, loot } from "../db/schema.ts";
import { requireGm } from "../lib/auth.ts";
import { badRequest, notFound } from "../lib/errors.ts";
import { idParam, readJson, uuidParam, type Router } from "../lib/http.ts";
import { logger } from "../lib/logger.ts";
import { assertMoneyInRange, campaignSession, lootView, ownedCampaign } from "../domain/campaign.ts";
import { assertCanClaim, claimLoot, claimNotice, releaseLoot } from "../domain/loot.ts";
import { gmClaimSchema, lootSchema, lootUpdateSchema } from "../../shared/schemas.ts";
import { CHARACTER_STATUSES, type LootStatus } from "../../shared/status.ts";

function ownedLoot(db: Db, gmId: string, lootId: number) {
  const row = db
    .select({ loot, campaignId: campaign.id })
    .from(loot)
    .innerJoin(campaign, eq(campaign.id, loot.campaignId))
    .innerJoin(campaignGm, and(eq(campaignGm.campaignId, campaign.id), eq(campaignGm.gmId, gmId)))
    .where(eq(loot.id, lootId))
    .get();
  if (!row) throw notFound("That item");
  return row;
}

function campaignCharacter(db: Db, campaignId: string, characterId: string) {
  const ch = db
    .select()
    .from(character)
    .where(and(eq(character.id, characterId), eq(character.campaignId, campaignId)))
    .get();
  if (!ch) {
    throw badRequest("That character isn't in this campaign.", {
      characterId: "Choose a character from this campaign.",
    });
  }
  return ch;
}

/**
 * Claimed and bought items need a character from this campaign, and a
 * claim needs one with shares; every other status clears it.
 */
function checkOwner(
  db: Db,
  campaignId: string,
  status: LootStatus,
  characterId: string | null,
): string | null {
  if (!CHARACTER_STATUSES.includes(status)) return null;
  if (characterId === null) {
    throw badRequest("Choose which character has this item.", {
      characterId: "Required for claimed or bought items.",
    });
  }
  const ch = campaignCharacter(db, campaignId, characterId);
  if (status === "claimed") assertCanClaim(ch);
  return ch.id;
}

export function lootRoutes(r: Router) {
  r.post("/api/campaigns/:id/loot", async (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    const input = await readJson(ctx, lootSchema);
    if (input.sessionId !== null) campaignSession(ctx.db, c.id, input.sessionId);
    const characterId = checkOwner(ctx.db, c.id, input.status, input.characterId);
    const row = ctx.db.transaction((tx) => {
      const row = tx
        .insert(loot)
        .values({ ...input, characterId, campaignId: c.id })
        .returning()
        .get();
      assertMoneyInRange(tx, c.id, "value");
      return row;
    });
    ctx.changed(c.id);
    logger.info("loot added", { requestId: ctx.requestId, lootId: row.id });
    return lootView(row);
  });

  r.patch("/api/loot/:id", async (ctx) => {
    const { loot: item, campaignId } = ownedLoot(ctx.db, requireGm(ctx).id, idParam(ctx));
    const input = await readJson(ctx, lootUpdateSchema);
    if (input.sessionId != null) campaignSession(ctx.db, campaignId, input.sessionId);
    const status = input.status ?? item.status;
    const characterId = checkOwner(
      ctx.db,
      campaignId,
      status,
      input.characterId !== undefined ? input.characterId : item.characterId,
    );
    const row = ctx.db.transaction((tx) => {
      const row = tx
        .update(loot)
        .set({ ...input, status, characterId })
        .where(eq(loot.id, item.id))
        .returning()
        .get();
      assertMoneyInRange(tx, campaignId, "value");
      return row;
    });
    ctx.changed(campaignId);
    logger.info("loot updated", { requestId: ctx.requestId, lootId: item.id, status });
    return lootView(row!);
  });

  /** The GM claims part or all of an available row for a character. */
  r.post("/api/loot/:id/claim", async (ctx) => {
    const { loot: item, campaignId } = ownedLoot(ctx.db, requireGm(ctx).id, idParam(ctx));
    const { characterId, quantity } = await readJson(ctx, gmClaimSchema);
    const who = campaignCharacter(ctx.db, campaignId, characterId);
    const row = claimLoot(ctx.db, who, item.id, quantity, true);
    ctx.changed(campaignId, claimNotice("claimed", who, row, true));
    logger.info("loot claimed by gm", {
      requestId: ctx.requestId,
      characterId: who.id,
      lootId: row.id,
      quantity,
    });
    return lootView(row);
  });

  /** The GM releases a character's claim back to the pool. */
  r.post("/api/loot/:id/release", (ctx) => {
    const { loot: item, campaignId } = ownedLoot(ctx.db, requireGm(ctx).id, idParam(ctx));
    if (item.status !== "claimed" || item.characterId === null) {
      throw badRequest("Only claimed items can be released.");
    }
    const who = campaignCharacter(ctx.db, campaignId, item.characterId);
    releaseLoot(ctx.db, who, item.id);
    ctx.changed(campaignId, claimNotice("released", who, item, true));
    logger.info("claim released by gm", {
      requestId: ctx.requestId,
      characterId: who.id,
      lootId: item.id,
    });
    return { ok: true };
  });

  r.delete("/api/loot/:id", (ctx) => {
    const { loot: item, campaignId } = ownedLoot(ctx.db, requireGm(ctx).id, idParam(ctx));
    ctx.db.delete(loot).where(eq(loot.id, item.id)).run();
    ctx.changed(campaignId);
    logger.info("loot deleted", { requestId: ctx.requestId, lootId: item.id });
    return { ok: true };
  });
}
