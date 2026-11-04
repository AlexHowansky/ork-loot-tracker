import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../api.ts";
import { keys } from "../queries.ts";
import { Field, withError } from "./Field.tsx";
import { CancelButton } from "./SubmitButton.tsx";

/** The join code a campaign's link carries in its fragment, if any. */
export function fromFragment(hash: string) {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return "";
  }
}

/**
 * Redeems join codes, going to the campaign's page on success. With
 * `campaignId`, only that campaign's codes are taken.
 */
export function useJoin(campaignId?: string, initialError: unknown = null) {
  const [error, setError] = useState<unknown>(initialError);
  const [busy, setBusy] = useState(false);
  /** The seat the last code took, once this browser knows it holds it. */
  const [joined, setJoined] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();

  async function join(value: string, replace = false) {
    setBusy(true);
    setError(null);
    try {
      // A code is for either a character or an observer.
      const res = await api.post<
        ({ characterId: string } | { observerId: string }) & { campaignId: string }
      >("/api/join", {
        code: value,
        ...(campaignId ? { campaignId } : {}),
      });
      await qc.invalidateQueries({ queryKey: keys.me });
      setJoined("characterId" in res ? res.characterId : res.observerId);
      // The campaign's page shows the character or observer just taken;
      // joining from that page itself just shows it anew.
      const to = `/campaigns/${res.campaignId}`;
      navigate(to, { replace: replace || to === pathname });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return { join, busy, error, joined };
}

/**
 * The join code input and its button, for embedding in any card body. On
 * a campaign's page, `campaignId` limits it to that campaign's codes; the
 * page redeems its link's code itself and, if that fails, passes the code
 * and the reason in.
 */
export function JoinForm({
  campaignId,
  initialCode = "",
  initialError,
  onCancel,
}: {
  campaignId?: string;
  /** A code the page already tried, with `initialError` saying why it failed. */
  initialCode?: string;
  initialError?: unknown;
  /** Adds a Cancel button beside Join, as in a modal. */
  onCancel?: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const { join, busy, error } = useJoin(campaignId, initialError);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void join(code);
  }

  const message = error ? errorMessage(error) : undefined;
  return (
    <form onSubmit={submit} noValidate>
      <Field label="Join code" error={message}>
        <input
          className={withError("input w-full font-mono uppercase tracking-widest", message)}
          autoFocus
          // A modal focuses this once it's open; autoFocus fires too soon.
          data-autofocus
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCDE-FGHJK"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <div className="card-actions justify-end mt-2">
        {onCancel && <CancelButton onClick={onCancel} />}
        <button className="btn btn-primary" disabled={busy || !code.trim()}>
          {busy && <span className="loading loading-spinner loading-sm" />}
          Join
        </button>
      </div>
    </form>
  );
}
