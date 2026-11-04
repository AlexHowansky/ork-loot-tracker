import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { campaign } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { uuidParam, type Router } from "../lib/http.ts";
import { sseResponse } from "../lib/events.ts";
import { campaignView } from "../domain/campaign.ts";
import type { CampaignView } from "../../shared/types.ts";

/**
 * The campaign with this id if it's public. A private campaign answers
 * just as a missing one does, so the link doesn't reveal that it exists.
 */
function publicCampaign(db: Db, id: string) {
  const row = db
    .select()
    .from(campaign)
    .where(and(eq(campaign.id, id), eq(campaign.public, true)))
    .get();
  if (!row) {
    throw new AppError(
      404,
      "That campaign couldn't be found, or it isn't public. If it's yours, sign in to see it.",
    );
  }
  return row;
}

/**
 * Anonymous, read-only access to public campaigns: what a player sees,
 * as no character, with no sign-in and no presence.
 */
export function publicRoutes(r: Router) {
  r.get("/api/public/:id", (ctx): CampaignView =>
    campaignView(ctx.db, publicCampaign(ctx.db, uuidParam(ctx)), { forGm: false }),
  );

  r.get("/api/public/:id/events", (ctx) => {
    const c = publicCampaign(ctx.db, uuidParam(ctx));
    return sseResponse(ctx, c.id, { gm: false, anonymous: true });
  });
}
