export interface AllocationInput {
  id: string;
  shares: number;
  claimed: number;
  /** Owed from earlier splits, taken off this payout. */
  debt?: number;
}

export interface Allocation extends AllocationInput {
  gross: number;
  debt: number;
  net: number;
}

export interface AllocationResult {
  /** What one share is worth, in whole minor units. */
  perShare: number;
  /** Units left after paying every share; goes to cash. */
  leftover: number;
  rows: Allocation[];
}

/**
 * Divides `total` across characters by shares. Every share is worth the
 * same whole number of minor units, the floor of `total / totalShares`,
 * and whatever that leaves undivided is returned as `leftover`. Net is
 * gross minus the value of what they claimed and any debt they owe, and
 * may be negative.
 */
export function allocate(
  total: number,
  rows: AllocationInput[],
): AllocationResult {
  const totalShares = rows.reduce((n, r) => n + r.shares, 0);
  const perShare = totalShares === 0 ? 0 : Math.floor(total / totalShares);
  return {
    perShare,
    leftover: total - perShare * totalShares,
    rows: rows.map((r) => {
      const gross = perShare * r.shares;
      const debt = r.debt ?? 0;
      return { ...r, gross, debt, net: gross - r.claimed - debt };
    }),
  };
}

export interface CashFlow {
  /**
   * What cash adds to the split: what it holds above the hold, or,
   * when negative, what the loot gives up to top it up to the hold.
   */
  cashIn: number;
  /** The loot plus `cashIn`, for the shares to divide. */
  total: number;
}

/**
 * How cash takes part in a split. It is first brought to `hold`:
 * anything above it joins the loot, and any shortfall comes out of the
 * loot, as far as the loot reaches. The leftover from dividing `total`
 * then goes back into cash on top of that.
 */
export function cashFlow(
  sellable: number,
  cash: number,
  hold: number,
): CashFlow {
  const kept = Math.min(hold, sellable + cash);
  const cashIn = cash - kept;
  return { cashIn, total: sellable + cashIn };
}
