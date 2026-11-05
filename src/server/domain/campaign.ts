import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { DbOrTx as Db } from "../db/client.ts";
import {
  campaign,
  campaignGm,
  character,
  gm,
  joinCode,
  loot,
  observer,
  cashEntry,
  session,
  split,
  splitShare,
  type Campaign,
  type Loot,
} from "../db/schema.ts";
import { formatMoney, MAX_MONEY, subtotal } from "../../shared/money.ts";
import type {
  CampaignInfo,
  GmView,
  CampaignSummary,
  CampaignView,
  LootView,
  CashEntryView,
  PoolView,
  SplitView,
} from "../../shared/types.ts";
import { HIDDEN_STATUSES } from "../../shared/status.ts";
import { allocate, cashFlow } from "./split.ts";
import { badRequest, notFound } from "../lib/errors.ts";

export function campaignInfo(c: Campaign): CampaignInfo {
  return {
    id: c.id,
    name: c.name,
    startDate: c.startDate,
    backgroundImage: c.backgroundImage,
    currencyLabel: c.currencyLabel,
    currencyDecimals: c.currencyDecimals,
    baseReferenceUrl: c.baseReferenceUrl,
    cash: c.cash,
    cashHold: c.cashHold,
    allowDebt: c.allowDebt,
    public: c.public,
  };
}

/**
 * A loot row for the client. Players see an unidentified item's name but
 * not its description, link (whose page would give the price) or value.
 */
export function lootView(row: Loot, forGm = true): LootView {
  if (row.unidentified && !forGm) {
    return {
      ...lootView(row),
      description: null,
      link: null,
      value: null,
      subtotal: 0,
    };
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    location: row.location,
    description: row.description,
    link: row.link,
    quantity: row.quantity,
    value: row.value,
    marketPct: row.marketPct,
    unidentified: row.unidentified,
    status: row.status,
    characterId: row.characterId,
    splitId: row.splitId,
    subtotal: subtotal(row.quantity, row.value, row.marketPct),
  };
}

/** Joins a campaign to `gmId`'s place among its GMs, if they have one. */
const runBy = (gmId: string) =>
  and(eq(campaignGm.campaignId, campaign.id), eq(campaignGm.gmId, gmId));

/** The campaign with this id if `gmId` is one of its GMs; otherwise a 404. */
export function ownedCampaign(db: Db, gmId: string, campaignId: string) {
  const row = db
    .select({ campaign })
    .from(campaign)
    .innerJoin(campaignGm, runBy(gmId))
    .where(eq(campaign.id, campaignId))
    .get();
  if (!row) throw notFound("That campaign");
  return row.campaign;
}

/** A campaign's GMs, earliest added first, with `gmId` marked as "you". */
export function campaignGms(db: Db, campaignId: string, gmId: string): GmView[] {
  return db
    .select({ id: gm.id, email: gm.email })
    .from(campaignGm)
    .innerJoin(gm, eq(gm.id, campaignGm.gmId))
    .where(eq(campaignGm.campaignId, campaignId))
    .orderBy(asc(campaignGm.createdAt), asc(gm.email))
    .all()
    .map((g) => ({ ...g, you: g.id === gmId }));
}

/** A session in this campaign; anything else is a field error. */
export function campaignSession(db: Db, campaignId: string, sessionId: number) {
  const row = db
    .select()
    .from(session)
    .where(and(eq(session.id, sessionId), eq(session.campaignId, campaignId)))
    .get();
  if (!row) {
    throw badRequest("That session isn't in this campaign.", {
      sessionId: "Choose a session from this campaign.",
    });
  }
  return row;
}

/** A campaign's loot, latest session first; loot with no session last. */
export function campaignLoot(db: Db, campaignId: string): Loot[] {
  return db
    .select({ loot })
    .from(loot)
    .leftJoin(session, eq(session.id, loot.sessionId))
    .where(eq(loot.campaignId, campaignId))
    .orderBy(sql`${session.date} IS NULL`, desc(session.date), asc(loot.id))
    .all()
    .map((r) => r.loot);
}

/**
 * Pool totals plus each character's projected split right now. Cash
 * above its hold is divided along with the loot, a shortfall below it is
 * taken from the loot first (see `cashFlow`), and each character's
 * debt comes off their payout.
 */
export function computePool(
  rows: Loot[],
  characters: { id: string; shares: number; debt?: number }[],
  c: Pick<Campaign, "cash" | "cashHold">,
) {
  let sellable = 0;
  let party = 0;
  let claimedTotal = 0;
  const claimedBy = new Map<string, number>();
  for (const r of rows) {
    // Unidentified items are worth nothing until the GM identifies them,
    // and pending ones (like sold or abandoned items) are outside the pool.
    if (r.unidentified) continue;
    const sub = subtotal(r.quantity, r.value, r.marketPct);
    if (r.status === "available") sellable += sub;
    else if (r.status === "party") party += sub;
    else if (r.status === "claimed") {
      sellable += sub;
      claimedTotal += sub;
      if (r.characterId !== null) {
        claimedBy.set(r.characterId, (claimedBy.get(r.characterId) ?? 0) + sub);
      }
    }
  }
  const flow = cashFlow(sellable, c.cash, c.cashHold);
  const { rows: allocations, leftover } = allocate(
    flow.total,
    characters.map((c) => ({
      id: c.id,
      shares: c.shares,
      claimed: claimedBy.get(c.id) ?? 0,
      debt: c.debt ?? 0,
    })),
  );
  const pool: PoolView = {
    sellable,
    party,
    claimed: claimedTotal,
    totalShares: characters.reduce((n, ch) => n + ch.shares, 0),
    cashIn: flow.cashIn,
  };
  return { pool, allocations, leftover, total: flow.total };
}

/**
 * Refuses a change that takes the campaign's money past `MAX_MONEY`: the
 * subtotals of all its loot, whatever its status, plus cash. Called
 * inside the change's transaction after it is written, so throwing rolls
 * it back; `field` names the form field to mark.
 */
export function assertMoneyInRange(db: Db, campaignId: string, field: string): void {
  const c = db.select().from(campaign).where(eq(campaign.id, campaignId)).get();
  if (!c) throw notFound("That campaign");
  const total = campaignLoot(db, campaignId).reduce(
    (n, r) => n + subtotal(r.quantity, r.value, r.marketPct),
    c.cash,
  );
  if (total > MAX_MONEY) {
    const most = formatMoney(MAX_MONEY, c.currencyDecimals, c.currencyLabel);
    throw badRequest(
      `That would bring the campaign's loot and cash to more than ${most}, ` +
        "the most it can record.",
      { [field]: "That's more than the campaign can record." },
    );
  }
}

export function listCampaigns(db: Db, gmId: string): CampaignSummary[] {
  const rows = db
    .select({ campaign })
    .from(campaign)
    .innerJoin(campaignGm, runBy(gmId))
    .orderBy(desc(campaign.startDate), asc(campaign.name))
    .all()
    .map((r) => r.campaign);
  return rows.map((c) => {
    const chars = db
      .select({ id: character.id, shares: character.shares })
      .from(character)
      .where(eq(character.campaignId, c.id))
      .all();
    const sessionCount =
      db
        .select({ n: sql<number>`count(*)` })
        .from(session)
        .where(eq(session.campaignId, c.id))
        .get()?.n ?? 0;
    const { pool } = computePool(campaignLoot(db, c.id), chars, c);
    return {
      ...campaignInfo(c),
      characterCount: chars.length,
      sessionCount,
      poolTotal: pool.sellable,
    };
  });
}

/**
 * Everything the campaign board shows. Join codes, player links, who is
 * online and the observers are included only for the GM.
 */
export function campaignView(
  db: Db,
  c: Campaign,
  opts: {
    forGm: boolean;
    isOnline?: (ch: { id: string; playerId: number | null }) => boolean;
  },
): CampaignView {
  const chars = db
    .select({ ...getTableColumns(character), joinCode: joinCode.code })
    .from(character)
    .leftJoin(joinCode, eq(joinCode.characterId, character.id))
    .where(eq(character.campaignId, c.id))
    .orderBy(asc(character.name))
    .all();
  const sessions = db
    .select()
    .from(session)
    .where(eq(session.campaignId, c.id))
    .orderBy(desc(session.date), desc(session.id))
    .all();
  const rows = campaignLoot(db, c.id);
  const { pool, allocations } = computePool(rows, chars, c);
  // Pending items haven't been found yet, so only the GM knows of them.
  const shown = opts.forGm ? rows : rows.filter((r) => !HIDDEN_STATUSES.includes(r.status));
  const counts = new Map<number, number>();
  for (const r of shown) {
    if (r.sessionId !== null) counts.set(r.sessionId, (counts.get(r.sessionId) ?? 0) + 1);
  }

  return {
    campaign: campaignInfo(c),
    characters: chars.map((ch, i) => {
      const a = allocations[i]!;
      return {
        id: ch.id,
        name: ch.name,
        shares: ch.shares,
        gross: a.gross,
        claimed: a.claimed,
        debt: a.debt,
        net: a.net,
        ...(opts.forGm
          ? {
              joinCode: ch.joinCode,
              hasPlayer: ch.playerId !== null,
              online: opts.isOnline?.(ch) ?? false,
            }
          : {}),
      };
    }),
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      title: s.title,
      notes: s.notes,
      itemCount: counts.get(s.id) ?? 0,
    })),
    loot: shown.map((r) => lootView(r, opts.forGm)),
    pool,
    splits: splitHistory(db, c.id),
    cash: cashLedger(db, c.id),
    // A public campaign has no observers, and the GM has no tab for them.
    ...(opts.forGm && !c.public
      ? {
          observers: db
            .select({ ...getTableColumns(observer), joinCode: joinCode.code })
            .from(observer)
            .leftJoin(joinCode, eq(joinCode.observerId, observer.id))
            .where(eq(observer.campaignId, c.id))
            .orderBy(asc(observer.name))
            .all()
            .map((o) => ({
              id: o.id,
              name: o.name,
              joinCode: o.joinCode,
              hasPlayer: o.playerId !== null,
              online: opts.isOnline?.(o) ?? false,
            })),
        }
      : {}),
  };
}

export function cashLedger(db: Db, campaignId: string): CashEntryView[] {
  return db
    .select({
      id: cashEntry.id,
      date: cashEntry.date,
      sessionId: cashEntry.sessionId,
      description: cashEntry.description,
      amount: cashEntry.amount,
      splitId: cashEntry.splitId,
    })
    .from(cashEntry)
    .where(eq(cashEntry.campaignId, campaignId))
    .orderBy(desc(cashEntry.date), desc(cashEntry.id))
    .all();
}

export function splitHistory(db: Db, campaignId: string): SplitView[] {
  const splits = db
    .select()
    .from(split)
    .where(eq(split.campaignId, campaignId))
    .orderBy(desc(split.createdAt), desc(split.id))
    .all();
  if (splits.length === 0) return [];
  const shares = db
    .select()
    .from(splitShare)
    .where(inArray(splitShare.splitId, splits.map((s) => s.id)))
    .orderBy(asc(splitShare.characterName))
    .all();
  return splits.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.getTime(),
    total: s.total,
    cash: s.cashIn,
    totalShares: s.totalShares,
    // Whatever the shares didn't take went to cash.
    leftover:
      s.total -
      shares.reduce((n, sh) => (sh.splitId === s.id ? n + sh.gross : n), 0),
    shares: shares
      .filter((sh) => sh.splitId === s.id)
      .map((sh) => ({
        characterId: sh.characterId,
        characterName: sh.characterName,
        shares: sh.shares,
        gross: sh.gross,
        claimed: sh.claimed,
        debtIn: sh.debtIn,
        net: sh.net,
      })),
  }));
}
