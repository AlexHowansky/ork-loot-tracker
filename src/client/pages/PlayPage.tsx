import { Navigate, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../api.ts";
import { keys, useMe, usePlay } from "../queries.ts";
import { useLiveUpdates } from "../live.ts";
import { CampaignBoard } from "../components/Board.tsx";
import { LoadError, Loading } from "../components/Layout.tsx";
import { useConfirm } from "../components/Confirm.tsx";
import { useToast } from "../components/Toast.tsx";
import { Icon, faArrowRightFromBracket } from "../components/Icon.tsx";
import type { PlayView } from "../../shared/types.ts";

/**
 * A player's board for the character this browser holds. It lives at the
 * campaign's address; `CampaignPage` picks it.
 */
export function PlayCampaign({ characterId: id }: { characterId: string }) {
  const { data: view, error, isPending } = usePlay(id);
  const ask = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useLiveUpdates(`/api/play/${id}/events`, [keys.play(id)], () => {
    const name = qc.getQueryData<PlayView>(keys.play(id))?.me.name ?? "your character";
    qc.removeQueries({ queryKey: keys.play(id) });
    // The campaign's page then shows whatever this browser may still see.
    void qc.invalidateQueries({ queryKey: keys.me });
    toast(
      `Your GM gave ${name} a new join code, so this browser can't play them any more. ` +
        "Ask your GM for the code to come back.",
      "info",
    );
  });

  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;

  async function leave() {
    const ok = await ask({
      title: `Stop playing ${view!.me.name} here?`,
      message: <p>This browser forgets {view!.me.name}. You'll need a new code from your GM to come back.</p>,
      confirmLabel: "Forget character",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/play/${id}`);
      qc.removeQueries({ queryKey: keys.play(id) });
      await qc.invalidateQueries({ queryKey: keys.me });
      navigate("/");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <CampaignBoard
      view={view}
      mode={{ kind: "player", characterId: view.me.id }}
      actions={
        <button type="button" className="btn btn-sm" onClick={leave}>
          <Icon icon={faArrowRightFromBracket} /> Forget character
        </button>
      }
    />
  );
}

/**
 * Where `/play/<character id>` links, from before players used the
 * campaign's address, now go.
 */
export function OldSeatLink() {
  const id = useParams().id ?? "";
  const { data: me, isPending } = useMe();
  if (isPending) return <Loading />;
  const seat = [...(me?.characters ?? []), ...(me?.observers ?? [])].find((s) => s.id === id);
  return <Navigate to={seat ? `/campaigns/${seat.campaignId}` : "/"} replace />;
}
