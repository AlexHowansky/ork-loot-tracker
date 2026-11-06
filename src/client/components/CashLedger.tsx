import { useState } from "react";
import { api, errorMessage } from "../api.ts";
import { useRefresh } from "../queries.ts";
import { formatMoney } from "../../shared/money.ts";
import type { CampaignView, CashEntryView, SessionView } from "../../shared/types.ts";
import { Money } from "./Money.tsx";
import { CashForm } from "./SimpleForms.tsx";
import { useConfirm } from "./Confirm.tsx";
import { useToast } from "./Toast.tsx";
import { Menu } from "./Menu.tsx";
import { Icon, faChevronDown, faLock, faMinus, faPen, faPlus, faScaleBalanced, faTrash } from "./Icon.tsx";
import type { Mode } from "./Board.tsx";

/** The cash ledger: the GM's adjustments and each split's change. */
export function CashLedger({ view, mode }: { view: CampaignView; mode: Mode }) {
  const [editing, setEditing] = useState<CashEntryView | "in" | "out" | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const refresh = useRefresh();
  const ask = useConfirm();
  const toast = useToast();
  const gm = mode.kind === "gm";
  const { campaign } = view;
  const money = (n: number) => formatMoney(n, campaign.currencyDecimals, campaign.currencyLabel);
  const sessionById = new Map(view.sessions.map((s) => [s.id, s]));

  // The ledger is newest first; balances build up from the oldest entry.
  const balances = new Map<number, number>();
  let running = 0;
  for (const e of [...view.cash].reverse()) {
    running += e.amount;
    balances.set(e.id, running);
  }

  /** What a split's entry is made of, e.g. a top-up and its leftover. */
  function splitDetail(splitId: number): string | null {
    const split = view.splits.find((s) => s.id === splitId);
    if (!split) return null;
    const parts: string[] = [];
    if (split.cash < 0) parts.push(`${money(-split.cash)} kept back to reach the reserve`);
    if (split.cash > 0) parts.push(`${money(split.cash)} above the reserve paid out`);
    if (split.leftover > 0) parts.push(`${money(split.leftover)} that didn't divide evenly`);
    return parts.join(", ");
  }

  async function remove(e: CashEntryView) {
    const ok = await ask({
      title: "Delete this entry?",
      message: (
        <p>
          <strong>{e.description}</strong> is removed from the ledger, and cash goes{" "}
          {e.amount > 0 ? "down" : "up"} by {money(Math.abs(e.amount))}.
        </p>
      ),
      confirmLabel: "Delete entry",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/cash/${e.id}`);
      toast("Entry deleted.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      refresh();
    }
  }

  async function moveToSession(e: CashEntryView, to: SessionView) {
    setBusyId(e.id);
    try {
      await api.patch(`/api/cash/${e.id}`, { sessionId: to.id, description: e.description, amount: e.amount });
      toast(`Moved ${e.description} to the ${to.date} session.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  /** A session's date, with its title and notes on hover; a dash for none. */
  const sessionLabel = (session: SessionView | undefined) =>
    session?.title || session?.notes ? (
      <span className="tooltip tooltip-top">
        <span className="tooltip-content text-left">
          {session.title && <span className="block font-semibold">{session.title}</span>}
          {session.notes && <span className="block whitespace-pre-line">{session.notes}</span>}
        </span>
        {session.date}
      </span>
    ) : (
      (session?.date ?? <span className="text-base-content/50">—</span>)
    );

  /** The GM's session cell: a menu of the other sessions to move the entry to. */
  const sessionMenu = (e: CashEntryView, session: SessionView | undefined) => (
    <Menu
      align="start"
      ariaLabel={`Session of ${e.description}: ${session?.date ?? "none"}. Change session`}
      buttonClass={`inline-flex cursor-pointer items-center gap-1 rounded px-1 hover:bg-base-200 hover:text-base-content ${busyId === e.id ? "pointer-events-none opacity-50" : ""}`}
      menuClass="w-max max-w-xs font-normal"
      label={
        <>
          {sessionLabel(session)}
          <Icon icon={faChevronDown} className="text-[0.6rem] opacity-70" />
        </>
      }
    >
      {view.sessions
        .filter((s) => s.id !== e.sessionId)
        .map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => moveToSession(e, s)}>
              {s.date}
              {s.title ? ` — ${s.title}` : ""}
            </button>
          </li>
        ))}
    </Menu>
  );

  return (
    <div>
      {gm && (
        <div className="mb-2 flex justify-end">
          <span
            className={view.sessions.length ? "flex gap-2" : "tooltip tooltip-left flex gap-2"}
            data-tip="Create a session first"
          >
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!view.sessions.length}
              onClick={() => setEditing("in")}
            >
              <Icon icon={faPlus} /> Cash in
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!view.sessions.length}
              onClick={() => setEditing("out")}
            >
              <Icon icon={faMinus} /> Cash out
            </button>
          </span>
        </div>
      )}
      {view.cash.length === 0 ? (
        <p className="py-6 text-center text-base-content/60">
          No cash entries yet.{gm && " Use Cash in or Cash out to record money paid in or out."}
        </p>
      ) : (
        <div>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
                {gm && (
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {view.cash.map((e) => {
                const detail = e.splitId === null ? null : splitDetail(e.splitId);
                const session = e.sessionId === null ? undefined : sessionById.get(e.sessionId);
                // A locked entry is greyed out. The Session cell fades its
                // text rather than its opacity, so its tooltip stays solid.
                const dim = e.locked ? "opacity-50" : "";
                return (
                  <tr key={e.id}>
                    <td className={`whitespace-nowrap font-medium ${dim}`}>{e.date}</td>
                    <td className={e.locked ? "text-base-content/50" : ""}>
                      {gm &&
                      e.splitId === null &&
                      !e.locked &&
                      view.sessions.some((s) => s.id !== e.sessionId)
                        ? sessionMenu(e, session)
                        : sessionLabel(session)}
                    </td>
                    <td className={dim}>
                      {e.splitId !== null && <Icon icon={faScaleBalanced} className="mr-1 text-base-content/60" />}
                      {e.description}
                      {detail && <div className="text-xs text-base-content/60">{detail}</div>}
                    </td>
                    <td className={`text-right ${dim}`}>
                      <Money amount={e.amount} campaign={campaign} />
                    </td>
                    <td className={`text-right ${dim}`}>
                      <Money amount={balances.get(e.id) ?? 0} campaign={campaign} />
                    </td>
                    {gm && (
                      <td className="text-right whitespace-nowrap">
                        {/* A split's entry goes only when the split is undone. */}
                        {e.locked && (
                          <span
                            className="tooltip px-1.5 text-base-content/50"
                            data-tip="Settled by a split"
                            aria-label="Locked: settled by a split"
                          >
                            <Icon icon={faLock} />
                          </span>
                        )}
                        {e.splitId === null && !e.locked && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-square tooltip"
                              data-tip="Edit"
                              aria-label={`Edit entry ${e.description}`}
                              onClick={() => setEditing(e)}
                            >
                              <Icon icon={faPen} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-square tooltip"
                              data-tip="Delete"
                              aria-label={`Delete entry ${e.description}`}
                              onClick={() => remove(e)}
                            >
                              <Icon icon={faTrash} />
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CashForm
          campaign={campaign}
          sessions={view.sessions}
          entry={typeof editing === "string" ? undefined : editing}
          direction={typeof editing === "string" ? editing : undefined}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
