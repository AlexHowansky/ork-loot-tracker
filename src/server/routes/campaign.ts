import { and, eq, gt, sql } from "drizzle-orm";
import {
  campaign,
  campaignGm,
  character,
  gm as gmTable,
  loot,
  observer,
  pettyCashEntry,
  session,
} from "../db/schema.ts";
import { requireGm } from "../lib/auth.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { idParam, readJson, uuidParam, type Router } from "../lib/http.ts";
import { sseResponse } from "../lib/events.ts";
import { logger } from "../lib/logger.ts";
import { RateLimiter } from "../lib/rate-limit.ts";
import { searchReference } from "../lib/reference-search.ts";
import { removeImage, saveImage } from "../lib/upload.ts";
import {
  campaignGms,
  campaignInfo,
  campaignView,
  listCampaigns,
  ownedCampaign,
} from "../domain/campaign.ts";
import { previewSplit, runSplit, undoSplit } from "../domain/loot.ts";
import { addGmSchema, campaignSchema } from "../../shared/schemas.ts";

/**
 * A campaign's one address: its GM's board, where anyone else may read it,
 * without signing in, while it's public, and, with a join code in the
 * fragment, the link that joins it.
 */
export const campaignUrl = (appUrl: string, id: string) => `${appUrl}/campaigns/${id}`;

export function campaignRoutes(r: Router) {
  const referenceLimiter = new RateLimiter(60, 60_000);
  // Each lookup says whether an address belongs to a GM, so keep it slow.
  const addGmLimiter = new RateLimiter(20, 15 * 60_000);

  r.get("/api/campaigns", (ctx) => listCampaigns(ctx.db, requireGm(ctx).id));

  r.post("/api/campaigns", async (ctx) => {
    const gm = requireGm(ctx);
    const input = await readJson(ctx, campaignSchema);
    const row = ctx.db.transaction((tx) => {
      const row = tx.insert(campaign).values(input).returning().get();
      tx.insert(campaignGm).values({ campaignId: row.id, gmId: gm.id }).run();
      return row;
    });
    logger.info("campaign created", { requestId: ctx.requestId, campaignId: row.id });
    return campaignInfo(row);
  });

  r.get("/api/campaigns/:id", (ctx) => {
    const gm = requireGm(ctx);
    const c = ownedCampaign(ctx.db, gm.id, uuidParam(ctx));
    return {
      ...campaignView(ctx.db, c, {
        forGm: true,
        isOnline: (ch) => ctx.events.isOnline(ch.id, ch.playerId),
      }),
      gms: campaignGms(ctx.db, c.id, gm.id),
      campaignUrl: campaignUrl(ctx.config.appUrl, c.id),
    };
  });

  r.post("/api/campaigns/:id/gms", async (ctx) => {
    const gm = requireGm(ctx);
    const c = ownedCampaign(ctx.db, gm.id, uuidParam(ctx));
    const { email } = await readJson(ctx, addGmSchema);
    addGmLimiter.hit(gm.id);
    const other = ctx.db
      .select({ id: gmTable.id })
      .from(gmTable)
      .where(eq(gmTable.email, email))
      .get();
    if (!other) {
      throw badRequest("No GM has that email address.", {
        email: "No GM has that email address.",
      });
    }
    const added = ctx.db
      .insert(campaignGm)
      .values({ campaignId: c.id, gmId: other.id })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!added) throw conflict("That GM already runs this campaign.");
    ctx.changed(c.id);
    logger.info("campaign gm added", {
      requestId: ctx.requestId,
      campaignId: c.id,
      gmId: other.id,
      by: gm.id,
    });
    return campaignGms(ctx.db, c.id, gm.id);
  });

  r.delete("/api/campaigns/:id/gms/:gmId", (ctx) => {
    const gm = requireGm(ctx);
    const c = ownedCampaign(ctx.db, gm.id, uuidParam(ctx));
    const gmId = uuidParam(ctx, "gmId");
    ctx.db.transaction((tx) => {
      const gms = tx
        .select({ gmId: campaignGm.gmId })
        .from(campaignGm)
        .where(eq(campaignGm.campaignId, c.id))
        .all();
      if (!gms.some((g) => g.gmId === gmId)) throw notFound("That GM");
      if (gms.length === 1) {
        throw conflict(
          "A campaign needs at least one GM. Delete the campaign instead if " +
            "no one should run it.",
        );
      }
      tx.delete(campaignGm)
        .where(and(eq(campaignGm.campaignId, c.id), eq(campaignGm.gmId, gmId)))
        .run();
    });
    // Their open pages for this campaign go back to their campaign list.
    const streams = ctx.events.revokeGm(c.id, gmId);
    ctx.changed(c.id);
    logger.info("campaign gm removed", {
      requestId: ctx.requestId,
      campaignId: c.id,
      gmId,
      by: gm.id,
      streams,
    });
    return { ok: true };
  });

  r.get("/api/campaigns/:id/events", (ctx) => {
    const gm = requireGm(ctx);
    const c = ownedCampaign(ctx.db, gm.id, uuidParam(ctx));
    return sseResponse(ctx, c.id, { gm: true, gmId: gm.id });
  });

  r.patch("/api/campaigns/:id", async (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    const input = await readJson(ctx, campaignSchema);
    if (input.currencyDecimals !== c.currencyDecimals) {
      const hasLoot = ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(loot)
        .innerJoin(session, eq(session.id, loot.sessionId))
        .where(eq(session.campaignId, c.id))
        .get();
      if ((hasLoot?.n ?? 0) > 0) {
        throw badRequest(
          "Decimal places can't change once the campaign has loot.",
          { currencyDecimals: "Locked because loot has been recorded." },
        );
      }
      // Petty cash is held in minor units, so its meaning would change too.
      const ledger = ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(pettyCashEntry)
        .where(eq(pettyCashEntry.campaignId, c.id))
        .get();
      if (c.pettyCash !== 0 || (ledger?.n ?? 0) > 0) {
        throw badRequest(
          "Decimal places can't change once petty cash has been recorded.",
          { currencyDecimals: "Locked because petty cash has been recorded." },
        );
      }
    }
    if (c.allowDebt && !input.allowDebt) {
      const owing = ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(character)
        .where(and(eq(character.campaignId, c.id), gt(character.debt, 0)))
        .get();
      if ((owing?.n ?? 0) > 0) {
        throw badRequest(
          "Debt can't be turned off while characters still owe.",
          { allowDebt: "Locked while characters carry debt." },
        );
      }
    }
    const goingPublic = input.public && !c.public;
    const { row, dropped } = ctx.db.transaction((tx) => {
      // A public campaign needs no observers, so making it public drops them.
      const dropped = goingPublic
        ? tx
            .delete(observer)
            .where(eq(observer.campaignId, c.id))
            .returning({ id: observer.id })
            .all()
        : [];
      const row = tx
        .update(campaign)
        .set(input)
        .where(eq(campaign.id, c.id))
        .returning()
        .get();
      return { row: row!, dropped };
    });
    // Observers' open pages go back to the start, as when one is deleted.
    let streams = 0;
    for (const o of dropped) streams += ctx.events.revoke(o.id);
    // Anyone reading it without signing in loses it once it's private.
    if (c.public && !input.public) streams += ctx.events.closePublic(c.id);
    if (c.public !== input.public) {
      logger.info(input.public ? "campaign made public" : "campaign made private", {
        requestId: ctx.requestId,
        campaignId: c.id,
        observersDeleted: dropped.length,
        streams,
      });
    }
    ctx.changed(c.id);
    return campaignInfo(row);
  });

  r.get("/api/campaigns/:id/reference", async (ctx) => {
    const gm = requireGm(ctx);
    const c = ownedCampaign(ctx.db, gm.id, uuidParam(ctx));
    const q = (ctx.url.searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 100) return [];
    referenceLimiter.hit(gm.id);
    return searchReference(ctx.config.fetch ?? fetch, c, q, ctx.requestId);
  });

  r.delete("/api/campaigns/:id", async (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    ctx.db.delete(campaign).where(eq(campaign.id, c.id)).run();
    ctx.changed(c.id);
    await removeImage(ctx.config.uploadDir, c.backgroundImage);
    logger.info("campaign deleted", { requestId: ctx.requestId, campaignId: c.id });
    return { ok: true };
  });

  r.put("/api/campaigns/:id/image", async (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    let form: FormData;
    try {
      form = await ctx.req.formData();
    } catch {
      throw badRequest("We couldn't read that upload. Please try again.");
    }
    const file = form.get("image");
    if (!(file instanceof File)) throw badRequest("Choose an image to upload.");
    const name = await saveImage(ctx.config.uploadDir, file);
    ctx.db.update(campaign).set({ backgroundImage: name }).where(eq(campaign.id, c.id)).run();
    ctx.changed(c.id);
    await removeImage(ctx.config.uploadDir, c.backgroundImage);
    return { backgroundImage: name };
  });

  r.delete("/api/campaigns/:id/image", async (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    ctx.db.update(campaign).set({ backgroundImage: null }).where(eq(campaign.id, c.id)).run();
    ctx.changed(c.id);
    await removeImage(ctx.config.uploadDir, c.backgroundImage);
    return { ok: true };
  });

  r.get("/api/campaigns/:id/split/preview", (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    return previewSplit(ctx.db, c);
  });

  r.delete("/api/campaigns/:id/splits/:splitId", (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    const splitId = idParam(ctx, "splitId");
    undoSplit(ctx.db, c, splitId);
    ctx.changed(c.id);
    logger.info("loot split undone", { requestId: ctx.requestId, campaignId: c.id, splitId });
    return { ok: true };
  });

  r.post("/api/campaigns/:id/split", (ctx) => {
    const c = ownedCampaign(ctx.db, requireGm(ctx).id, uuidParam(ctx));
    const result = runSplit(ctx.db, c);
    ctx.changed(c.id);
    logger.info("loot split", {
      requestId: ctx.requestId,
      campaignId: c.id,
      splitId: result.id,
      total: result.total,
      leftover: result.leftover,
      debt: result.shares.reduce((n, sh) => n + Math.max(0, -sh.net), 0),
    });
    return result;
  });
}
