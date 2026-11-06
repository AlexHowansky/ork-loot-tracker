## Phat Loot Specification

What the app does: its terms and its features. How it is built is in
`CLAUDE.md`.

## Terms

We define the following terms:

### GM

An authenticated app user with elevated permissions. A GM signs in with an
email address and a password. Email addresses are unique and ignore case
and surrounding spaces.

### Character

A virtual character in a game world. A character belongs to one campaign.

### Player

An app user invited by a code. The code ties the user to one character.

### Observer

Someone who follows a campaign without playing in it. The GM creates an
observer and gives its join code to whoever should watch. An observer sees
what players see but is read-only: they have no share in splits and can't
claim loot. A public campaign has no observers, since anyone with its link
can follow it.

### Campaign

A campaign is run by one or more GMs and has zero or more sessions.
Campaigns have names, start dates, optional background images, and zero or
more characters. A campaign's GMs are all equals: wherever this document
says "the GM" of a campaign, any of its GMs may do it.

### Cash

A per-campaign amount, in the campaign's currency, set aside for shared
costs such as tavern stays and healing potions. Splits keep it at the
campaign's cash reserve and add to it what they can't divide evenly; the
GM records money paid in or out of it by hand. Every change is an entry in
the cash ledger, so the ledger always adds up to the balance. The GM
and players see it next to the party fund.

### Debt

What a character still owes because their claims were worth more than
their share in an earlier split. Only campaigns that allow debt carry it.
The next splits take it off the character's payout until it is repaid. It
isn't edited by hand.

### Session

A single instance of game play, typically a few hours long. A session belongs to
a campaign and has a date.

### Loot Pool

The pile of loot thus far accumulated for a campaign. Items will be frequently
added (acquired through gameplay) and removed (claimed by a player or sold.)

### Loot Split

The pile of loot is sold and the proceeds are split amongst the characters.

## Features

We are building an app to track loot in table-top role playing games. We'll
allow the GM to establish what loot has become available, and we'll allow the
players to claim or sell the loot. The app will track the value of the loot,
the size of the share that each player gets when selling based on what items
they have claimed from the pool.

* GMs are created by a CLI tool. GMs sign in with their email address and
  password. After 10 failed sign-ins for one address within 15 minutes,
  sign-ins for it are paused until the 15 minutes are up, wherever they
  come from.

* The GM sign-in panel has a "Forgot password?" link. It asks for an email
  address and always answers the same way, so it doesn't reveal which
  addresses belong to GMs. A GM's address is emailed a link that works once
  and for one hour; asking again replaces the earlier link. An address can
  be asked about at most 3 times an hour, whether or not it belongs to a
  GM. The link opens a page to choose a new password (at least 10
  characters, typed twice). Saving it signs the GM out everywhere else and
  signs them in. Pages they still have open in other browsers go back to
  the start at once, saying why.

* GMs can view, create, edit, and delete their own campaigns. A GM's own
  campaigns are those they run: the ones they created and the ones another
  GM added them to.

* The campaign menu's "GMs" item opens a dialog listing the campaign's GMs
  by email address, marking the viewer with "you". Any of its GMs can add
  another GM by the email address they sign in with; it must belong to an
  existing GM account (accounts still come only from the CLI), and the
  dialog says so if it doesn't. Any of its GMs can remove another, or
  leave the campaign themselves, after confirming ("Remove GM" or "Leave
  campaign"). A campaign always keeps at least one GM: the last can't be
  removed, and deletes the campaign instead if no one should run it. A
  removed GM loses access at once; a page they have open on that campaign
  goes back to their campaign list, saying why. Adding GMs is rate limited
  per GM, since each attempt reveals whether an address has an account.
  Players never see who the GMs are: toasts still say "The GM".

* Each campaign sets its currency: a label (e.g. "gp") and 0 to 3 decimal
  places. The decimal places are locked once the campaign has any loot or
  any cash ledger entries.

* The campaign form lays its fields out in two columns (one on narrow
  screens). The left holds name, start date, game system, currency,
  decimal places and base reference URL; the right holds cash reserve,
  allow debt, public and background image.

* Each campaign has a "Public" checkbox, off by default. A public campaign
  can be read by anyone with its URL, without signing in or a join code.
  That is the campaign's one address (`APP_URL` then `/campaigns/` and its
  id): its GM sees their own board there, and anyone else sees what an
  observer sees, updated live, and changes nothing; the header says
  "Public view". A browser holding no characters or observers gets a
  "Join" button in the nav bar there, opening a join code box for that
  campaign only; joining shows the campaign as the character or observer
  taken, at the same URL. To anyone but its GM, a private
  campaign's URL answers as if there were no such campaign, and suggests
  signing in if it's theirs. When the box is ticked on a saved campaign,
  a copy button beside it copies the URL.

* Observers aren't needed while a campaign is public, so making it public
  deletes them, after the GM confirms when there are any, and signs out
  their holders as deleting one does. A public campaign has no Observers
  tab and can't be given observers. Making it private again brings the tab
  back, empty, and anyone reading it through its URL loses it at once.

* The campaign form has a game system selector, a shortcut that fills in the
  currency label, decimal places and base reference URL; the choice itself
  isn't stored, and it shows "Custom" when the fields match no system.
  Pathfinder 2E Remaster is gp, 2 places, https://2e.aonprd.com/; Starfinder
  2E is cr, 1 place, https://2e.aonsrd.com/. Once decimal places are locked,
  systems that use different decimal places can't be picked.

* Each campaign has an "Allow debt" checkbox, off by default. When it's
  off, a split can't run while any character's payout would be negative;
  the split preview says who and why. When it's on, a negative payout
  becomes that character's debt. Debt can't be turned off while any
  character owes.

* Each campaign has a cash reserve, a whole number (0 or more, 0 by
  default) of its currency, set in the campaign form. It is what each split
  keeps in cash (see the loot split below).

* Each campaign may set a base reference URL (an http or https address, e.g.
  a rules reference site). The loot form searches it for items (see below).

* A campaign's background image is uploaded to local disk (PNG, JPEG or WebP,
  up to 5 MB, checked by content rather than by the type the browser claims).
  The GM's campaign list and the player's character picker show it cropped
  to a square at the top of each card.

* GMs can add zero or more characters to a campaign. Each character has a name
  (required, unique within the campaign regardless of case) and a number of
  shares (required, a whole number from 0 to 100, default 1.) A character
  with 0 shares sits splits out, e.g. one who has left the party or missed
  the sessions being split, and can't claim loot. Setting a character's
  shares to 0 releases their claims back to the pool, after the GM is
  warned how many will go. Characters
  get a default join code which can be given to players. Once used, the code is
  invalidated. If the player misplaces the code, the GM can create a new one.
  Creating a new code signs out the character's current player at once;
  whoever redeems the new code takes the character over. A page the old
  player has open says the GM gave the character a new join code, and
  then shows the campaign as to a browser that holds nothing in it (see
  below); one that missed being told shows that when next loaded.
  The copy button beside a code copies a join link (the campaign's URL,
  with the code in the URL fragment) rather than the bare code. Opening
  the link joins straight away, as if the code had been entered, showing
  only a loading indicator until the character or observer opens; the
  join box never appears on the way. If it can't (say the code is used
  up), the page shows why, with the code in its box, and the public view
  below it when the campaign is public. A
  campaign's link only takes that campaign's codes; any other code is
  refused as if it were unknown. There is no separate join page.

* A campaign's URL is also where its players and observers see it; there
  is no separate address per character or observer. To anyone but its GM,
  it shows the campaign as the character this browser holds in it, or
  else as its observer. A browser holding neither sees the public view if
  the campaign is public, and otherwise a join code box that doesn't name
  the campaign. Players aren't expected to hold two characters in one
  campaign; a browser that does sees the one it joined last while the
  page is open, and otherwise the first by name. Older per-character and
  per-observer addresses go to the campaign's URL.

* GMs can add observers to a private campaign. Each has a name (required, unique
  among the campaign's observers regardless of case) and a join code that
  works just like a character's: it's used up once redeemed, a new one
  signs out the current holder at once, and a page they have open says
  so, as a character's does. The GM can rename and delete observers;
  deleting one signs out its holder the same way.

* An observer sees the whole campaign as a player does (unidentified items
  stay hidden, join codes are GM-only), updated live, but changes nothing:
  no claims, releases or anything else. They have no shares, take no part
  in splits and don't count towards the pool's shares. The header says
  "Observing as" and the observer's name. Only the GM sees the list of
  observers.

* The GM's characters table shows a "Joined" pill for each character a
  player has taken, and beside it an "Online" pill while that player has
  the character's campaign page open in a browser. It appears and goes
  within moments, without reloading. Players don't see who is online. The
  observers table shows the same pills for each observer.

* A character who has taken part in a loot split can't be deleted, so split
  history stays intact. Deleting any other character returns their claims to
  the pool.

* Players can provide a code to take ownership of one character in one campaign.
  This session does not expire. One browser can hold several characters, with
  a picker to switch between them, and can choose to forget a character. The
  picker shows a card per character, with its campaign's image. A browser
  holding nothing yet has the join code box on its home page; joining
  opens the code's campaign.
  The same browser can hold observers too, by redeeming their codes: the
  picker shows a card per observed campaign, and an observer can be
  forgotten in the same way. Once a browser holds any, the nav bar has a
  Characters menu listing only them, with a "Join" button to its right
  that opens the join code box in a modal, on any page.

* Players see the whole campaign: every loot item, every character's shares
  and projected payout, and the split history. Join codes are GM-only.

* Every browser showing a campaign, the GM's and players' alike, updates
  within moments when anything in it changes (loot, claims, splits,
  characters, sessions), without reloading the page.

* When anyone claims or releases loot, whether a player for their own
  character or the GM on a character's behalf, every other browser showing
  the campaign, the GM's and players' alike, shows a toast saying who
  claimed or released what, and how many. When the GM does it, the toast
  says so and names the character it was done for ("The GM claimed Rope on
  behalf of Grog."). The tab that made the change shows its own
  confirmation instead.

* The campaign page, for the GM and players alike, shows its contents in tabs
  in this order: "Loot", "Cash", "Sessions", "Characters" and
  "Splits". Loot is shown first. For a private campaign, the GM also sees
  an "Observers" tab, after "Characters", listing the campaign's observers
  with their join codes.

* The "Cash" tab is the cash ledger, newest first, showing each
  entry's date, session, description, amount (negative when paid out) and
  the balance after it. The GM adds entries with a "Cash in" button, for
  money paid in (e.g. job earnings), or a "Cash out" button, for money paid
  out (e.g. buying goods or services). Each entry has a session (default
  the latest), a description and an amount greater than zero, entered
  without a sign; the button sets the direction, and money paid out is
  shown negative. Adding one needs a session to exist. The GM can also
  edit an entry, including switching it between in and out, and delete it.
  An entry that would take cash below zero, as added, edited or
  deleted, is refused. Each split that changes cash adds a "Loot
  split" entry of its own, showing what was kept back for the reserve, paid
  out above it, or left over; it belongs to no session, can't be edited or
  deleted, and goes when the split is undone. A split also locks every
  entry already in the ledger: it is greyed out for everyone, shows the
  GM a lock in place of its edit and delete buttons, and can't be edited
  or deleted, so what a split was run against stays settled. A mistake in one is corrected with a new
  entry. Entries added after the split stay editable until the next one,
  and undoing a split unlocks the entries it locked. Players see the
  ledger but can't change it.

* The ledger's Session column shows the session's date, or a dash when
  the entry has no session. Hovering over the date shows that session's
  title and notes, as on the loot table. For the GM, it opens a menu of
  the other sessions, which moves the entry there (and so to that
  session's date) without opening the edit form. A split's entry, a locked
  entry, and every entry while there's no other session to move to show
  the plain date instead.

* An entry's date is its session's date, and changes with it. Deleting a
  session keeps its entries, and so the balance: each stays in the ledger
  with its date but no session (the confirmation says so), and can be given
  another session by editing it, unless a split has locked it.

* The GM can view, create, edit, and delete sessions in their campaigns.

* The GM can view, create, edit, and delete loot in their campaigns. Each
  loot entry includes session (optional, since pending loot hasn't turned up
  in play yet), name (required, not unique), location
  (optional, up to 100 characters, e.g. "Bag of holding"), description
  (optional), link (optional, http or https only), quantity (required,
  default 1), value (optional), market percentage (default 50% because we
  only get half value when we sell) and status.

* The loot form's session defaults to the session the loot table is
  filtered to, then the latest session, and offers "No session". Editing an
  item can move it to another session or take it off one. Adding loot
  doesn't need a session to exist.

* Deleting a session keeps its loot: each item stays with no session (the
  confirmation says so), and can be given another session by editing it.

* The loot form puts location to the right of name. "Save and add another"
  keeps the location, since a haul is often stowed in one place.

* A loot item can be marked unidentified (off by default), from a checkbox
  to the right of the loot form's status. Until the GM clears it:
    * Players see the item's name and location, but not its description,
      link (whose page could give its price) or value; the server never
      sends them those. The loot table marks it with an "Unidentified" badge.
    * Players can't claim it. The GM can claim it for a character, and a
      claimed part of a stack stays unidentified.
    * Its value counts as zero everywhere: the pool, party fund, claims,
      projected payouts and the loot table's total.
    * A split leaves it as it is, available or claimed, so it can be sold
      at its real value once identified.

* A pending item is known only to the GM: players, observers and the
  public view never see it (the server never sends it, and sessions'
  item counts leave it out). It is worth nothing in the pool, party fund
  and projected payouts, can't be claimed and is left alone by splits.
  The GM's loot table strikes out its subtotal and leaves it out of the
  table's total, as for an unidentified item. Changing its status, e.g.
  to available, reveals it. "Save and add another" keeps the status, so
  a haul can be preloaded as pending.

* When the campaign's base reference URL is a site the app knows how to
  search (for now the Archives of Nethys at https://2e.aonprd.com/ and
  https://2e.aonsrd.com/), the loot form's link field suggests up to 10
  items from that site matching the item's name. Choosing one fills in the
  link, and the value too when the site gives a price that converts exactly
  into the campaign's currency (gp for Pathfinder, cr for Starfinder). The
  server makes the search itself and contacts only those known sites; other
  base reference URLs get no suggestions.

* When a loot item has a link, its name in the loot table links to it, in a
  new tab, for the GM and players alike.

* The loot table shows each item's location in a "Location" column right
  after the item's name. On narrow screens it appears under the name.

* The loot table shows each item's status as a pill on its own, and the
  character who claimed or bought it in a separate "Claim" column.
  Each pill has an icon: an hourglass for pending, a tag for available, a
  group of people for party, a hand for claimed, a person for bought, a
  sack of money for sold and a trash can for abandoned. Hovering over a
  status pill shows what that status means, as described below.

* For the GM, each status pill is also a button. Clicking it opens a menu
  of the other statuses, and choosing one changes the item's status:
    * Claimed, for an available item, asks for the character and, for a
      stack, how many, just as the Claim button does.
    * Available, for a claimed item, releases the claim, just as the
      Release button does.
    * Claimed or bought keeps the item's character when it has one that
      can hold it; otherwise the GM is asked which character. Claimed
      can't be chosen while no character has shares, nor bought while
      the campaign has no characters.
    * Any other status clears the item's character.
  Players see a plain pill that can't be clicked. So do GMs for an item
  that's bought, sold or abandoned, so that an item that's gone isn't
  changed by accident; the GM can still change it in the edit form.

* When the loot table shows all sessions, a "Session" column after "Claim"
  shows the session's date, or a dash for an item with no session. Hovering
  over the date shows that session's title and notes. For the GM, the date
  (or dash) opens a menu of "No session" and the other sessions, which moves
  the item there without opening the edit form. As with the status pill, an
  item that's bought, sold or abandoned shows a plain date instead, and so
  does every item while the campaign has no sessions.

* The loot table is sorted by item name, A to Z, until another column is
  chosen. Clicking any column header but the actions sorts the table by
  it, ascending; clicking it again reverses the order. An arrow marks the
  sorted column and its direction. Status sorts as pending, available,
  party, claimed, bought, sold, abandoned, and Session by the session's
  date (no session counts as blank).
  Blank cells (no location, value or claimant, or a value hidden from players
  because the item is unidentified) sort last either way. Ties fall back
  to the item name. The choice lasts while the campaign page is open,
  across tab changes.

* The loot table filters by session ("All sessions", "No session" or one
  session) and by status: "Pool" (available, party
  and claimed), "Available" (not yet claimed), "Pending" (for the GM only),
  "Gone" (sold, bought and abandoned) and "All".

* The loot table also filters by who claimed or bought an item: "Anyone",
  "Unclaimed" (no character) or one character, listed by name.

* A search box beside the loot table's filters narrows it to items whose
  name contains the text typed, ignoring case and accents. It works together
  with the other filters, and Escape clears it. Following a session's link
  to its loot clears the search and the character filter.

* Each character in the characters table has a "Show loot" button, for the
  GM and players alike. It opens the Loot tab showing everything that
  character has claimed or bought, from all sessions and of every status,
  with the search cleared.

* A "Clear" button beside the loot table's filters puts them all back to
  their defaults: "Pool", all sessions, "Anyone" and an empty search. It
  leaves the sort as it is, and is disabled when there's nothing to clear.

* Item statuses are as follows:
    * Pending: This item has not yet been encountered in-game. The GM can use
               this to preload items in bulk and then reveal them as they are
               discovered.
    * Available: This item is in the current loot pool, is free to be claimed,
                 and will be sold during the next split. This is the default for
                 new items.
    * Claimed: This item is in the current loot pool and has been claimed by a
               character. Its market value will be deducted from the claiming
               player's next split.
    * Party: This item has been set aside into a party fund, can not be claimed,
             and will not be sold during the next split. This is useful for
             shared items or emergency use items.
    * Sold: This item went unclaimed and was sold during a prior split. It is
            listed here for historical purposes only.
    * Bought: This item was claimed and had its value accounted for during a
              prior split. It is listed here for historical purposes only.
    * Abandoned: This item was discarded or never picked up. It is listed here
                 for informational purposes only.

* Each loot row should calculate a subtotal of quantity times value, further
  adjusted for market percentage.

* A campaign can record at most 90,071,992,547,409 minor units (a hundredth
  of the largest whole number a browser counts exactly), so its totals never
  lose precision. No single value, cash entry or reserve may exceed it,
  and an added or edited item or cash entry is refused if it would
  bring the subtotals of all the campaign's loot (whatever its status) plus
  cash above it.

* For each campaign, keep a running total of the value of the loot pool. Keep
  track of each character's share of the value.

* Allow players to claim pieces of available loot for their character. Claimed
  pieces reduce the character's share accordingly. Once a piece has been
  claimed, it can not be claimed by another character. If a line has more than
  one quantity, ask the player how many they want to claim, and then split as
  appropriate.

* Players can release their own claims back to the pool. A released part of
  a stack merges back into the matching available row from the same session
  (or with no session, as the claim had).
  A split stack's parts keep its location; a part since moved elsewhere
  doesn't match, and comes back as a row of its own.

* The GM can claim available loot on a character's behalf from the loot table,
  choosing the character and, for a stack, how many, and can release any
  character's claim. These work just as a player's own claims and releases.

* Players can only set status to claimed. This also associates their character
  with the item.

* Only the GM can set statuses besides claimed.

* The GM can, at any time, perform a loot split. This represents selling off
  loot acquired since the last loot split. When a loot split happens:
    * Add the value of all available items plus all claimed items.
    * Bring cash to the reserve: if it holds less, take the difference
      from that total first (as far as the total reaches); if it holds
      more, add the excess to the total.
    * Allocate this total across all characters, accounting for the number of
      shares each has. A split needs at least one share among the
      characters. A character with 0 shares takes no part in the split and
      isn't recorded in it.
    * Subtract the value of each player's claimed items, and any debt they
      owe, from their share.
    * Report each player's split value. This is how much they earn from the
      sale. It can be negative when their claims and debt are worth more
      than their share; that is refused unless the campaign allows debt,
      in which case it becomes their debt.
    * Update each claimed item to bought. Update each available item to sold.

* Claimed items are valued at their market-adjusted subtotal, the same figure
  that goes into the total. Every share is worth exactly the same: the total
  divided by the number of shares, rounded down to a whole minor unit. A
  character's share is that amount times their shares, before claims are
  subtracted. Whatever doesn't divide evenly is added to cash, even
  when the reserve is 0, but only when the split is run; the split preview
  shows how much cash is kept back or paid out and how much will be
  left over, and the split history shows what each split divided, kept
  back and left over.

* The board's pool to split and per-share figures, and each character's
  projected payout, include cash above the reserve and leave out any
  top-up below it. Projected payouts also take off each character's debt.

* Debt repaid in a split is only held back from the debtor's payout; it
  isn't divided among the others, who were paid their full share in the
  split where the debt arose. A character with 0 shares keeps their debt
  until a later split they take part in. The characters table shows a
  Debt column, and the split history a "Debt in" column, whenever there
  is any; a player who owes sees their debt on the board.

* When a campaign doesn't allow debt and a player's projected payout is
  negative, their nav bar shows a warning icon. Hovering over it, or
  focusing it, explains that debt isn't allowed and the GM can't run a
  split until their payout is positive.

* The GM sees a preview of the split before running it. Every split is kept
  in a history showing each character's share, claims and payout.

* The GM can undo the most recent split, from a button in its entry in the
  split history, after confirming. Undoing it turns its bought items back
  into claims for the same characters and its sold items back to available,
  reverses the split's change to cash (removing its ledger entry, but
  keeping entries made since), unlocks the ledger entries it locked, puts
  each character's debt back to what it was before the split, and removes
  the split from the history. It is refused when cash has since been spent
  too low to reverse that change. Older splits can then be undone in turn. A bought item whose character now has 0 shares goes
  back to available instead, since that character can't hold a claim.
