import type { LootStatus } from "./status.ts";

/** Shapes returned by the JSON API. Money is in minor units. */

export interface Me {
  gm: { id: string; email: string } | null;
  characters: PlayerCharacter[];
  /** Campaigns this browser follows without playing in them. */
  observers: PlayerObserver[];
}

export interface PlayerCharacter {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  campaignImage: string | null;
}

/** An observer this browser holds; `name` is the observer's own. */
export type PlayerObserver = PlayerCharacter;

export interface CampaignInfo {
  id: string;
  name: string;
  startDate: string;
  backgroundImage: string | null;
  currencyLabel: string;
  currencyDecimals: number;
  /** Where item links will point, e.g. a rules reference site. */
  baseReferenceUrl: string | null;
  /**
   * The cash ledger's balance. Changed only through ledger entries,
   * by the GM or by splits.
   */
  cash: number;
  /** What each split tops cash up (or pays it down) to. */
  cashHold: number;
  /** Whether a split may leave a character owing, carried as debt. */
  allowDebt: boolean;
  /** Anyone with the campaign's URL may read it, without signing in. */
  public: boolean;
}

/** An item found on the campaign's reference site. */
export interface ReferenceMatch {
  name: string;
  url: string;
  level: number | null;
  /** The price as the site writes it, e.g. "4 gp". */
  priceLabel: string | null;
  /** The price in the campaign's minor units, when it converts exactly. */
  value: number | null;
}

export interface CampaignSummary extends CampaignInfo {
  characterCount: number;
  sessionCount: number;
  poolTotal: number;
}

export interface CharacterView {
  id: string;
  name: string;
  shares: number;
  /** Projected share of the pool and cash if a split ran now. */
  gross: number;
  /** Market value of items this character has claimed. */
  claimed: number;
  /** Owed from earlier splits; the next split takes it off their payout. */
  debt: number;
  /** Projected payout: gross minus claims and debt. */
  net: number;
  /** GM only: the unused join code, if any. */
  joinCode?: string | null;
  /** GM only: whether a player has taken this character. */
  hasPlayer?: boolean;
  /** GM only: whether that player has the character open right now. */
  online?: boolean;
}

/**
 * GM only: someone who follows the campaign without playing in it. They
 * see what players see, but have no shares and can't claim loot.
 */
export interface ObserverView {
  id: string;
  name: string;
  /** The unused join code, if any. */
  joinCode: string | null;
  /** Whether a player has taken this observer. */
  hasPlayer: boolean;
  /** Whether that player has the campaign open right now. */
  online: boolean;
}

export interface SessionView {
  id: number;
  date: string;
  title: string | null;
  notes: string | null;
  itemCount: number;
}

export interface LootView {
  id: number;
  /** Null for loot not yet found in play, or once its session is deleted. */
  sessionId: number | null;
  name: string;
  /** Where the item is kept; players see it even while unidentified. */
  location: string | null;
  description: string | null;
  link: string | null;
  quantity: number;
  value: number | null;
  marketPct: number;
  /**
   * Players see such an item's name but no description, link or value; it
   * counts as zero in every total.
   */
  unidentified: boolean;
  status: LootStatus;
  characterId: string | null;
  splitId: number | null;
  subtotal: number;
}

export interface PoolView {
  /** Available + claimed: what a split would sell. */
  sellable: number;
  party: number;
  claimed: number;
  totalShares: number;
  /**
   * Cash a split would pay out above the hold, or, when negative,
   * what it would take from the loot to top cash up to the hold.
   */
  cashIn: number;
}

export interface SplitShareView {
  characterId: string | null;
  characterName: string;
  shares: number;
  gross: number;
  claimed: number;
  /** Debt brought into this split and taken off the payout. */
  debtIn: number;
  /** Negative when the character ends the split owing. */
  net: number;
}

export interface SplitView {
  id: number;
  createdAt: number;
  /** The loot sold plus `cash`: what the shares divided. */
  total: number;
  /**
   * Cash above the hold paid out with the loot, or, when negative,
   * what was taken from the loot to top cash up to the hold.
   */
  cash: number;
  totalShares: number;
  /** What the shares couldn't divide evenly; it becomes the cash. */
  leftover: number;
  shares: SplitShareView[];
}

export interface CashEntryView {
  id: number;
  date: string;
  /** Null for a split's entry, or once the entry's session is deleted. */
  sessionId: number | null;
  description: string;
  /** Paid in when positive, paid out when negative. */
  amount: number;
  /** Set when a split made this entry; only undoing the split removes it. */
  splitId: number | null;
  /** A hand-written entry a later split settled; it can't be changed. */
  locked: boolean;
}

/** One of a campaign's GMs, as the others see them. */
export interface GmView {
  id: string;
  email: string;
  /** The GM looking at the list. */
  you: boolean;
}

export interface CampaignView {
  campaign: CampaignInfo;
  characters: CharacterView[];
  sessions: SessionView[];
  loot: LootView[];
  pool: PoolView;
  splits: SplitView[];
  /** The cash ledger, newest first. */
  cash: CashEntryView[];
  /** GM only: the campaign's observers. */
  observers?: ObserverView[];
  /** GM only: everyone who runs the campaign. */
  gms?: GmView[];
  /**
   * GM only: the campaign's address, from APP_URL, where anyone may read
   * it while it's public. A join code goes after it in the fragment to
   * make a link that joins the campaign.
   */
  campaignUrl?: string;
}

export interface PlayView extends CampaignView {
  me: { id: string; name: string };
}

/** What an observer sees: the player's view, as no character. */
export interface WatchView extends CampaignView {
  observer: { id: string; name: string };
}

/**
 * Something a live update says happened, so other tabs can show a toast.
 * It names only what every view of the campaign already shows.
 */
export interface LiveNotice {
  kind: "claimed" | "released";
  /** The GM did it on the character's behalf. */
  byGm: boolean;
  character: string;
  item: string;
  quantity: number;
}

export interface ApiErrorBody {
  error: string;
  fields?: Record<string, string>;
}
