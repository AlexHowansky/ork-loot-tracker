import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api.ts";
import { keys, useMe, usePublic } from "../queries.ts";
import { useLiveUpdates } from "../live.ts";
import { CampaignBoard } from "../components/Board.tsx";
import { LoadError, Loading } from "../components/Layout.tsx";
import { NavPortal } from "../components/NavSlot.tsx";
import { JoinButton } from "../components/JoinButton.tsx";

/**
 * A public campaign, read-only, for anyone with its link who isn't its GM.
 * It shares the GM's address; `CampaignPage` picks which to show.
 */
export function PublicCampaign({ id }: { id: string }) {
  const { data: view, error, isPending } = usePublic(id);
  const qc = useQueryClient();
  const { data: me } = useMe();
  // A browser holding any seat already has the nav bar's own Join button.
  const ownJoin = !me || me.characters.length + me.observers.length === 0;
  // The stream ends with "revoked" once the GM makes the campaign private;
  // refetching then shows that it no longer is public.
  useLiveUpdates(`/api/public/${id}/events`, [keys.public(id)], () => {
    void qc.invalidateQueries({ queryKey: keys.public(id) });
  });

  if (isPending) return <Loading />;
  // Keep showing the 404's message rather than a stale board.
  if (error && (!view || (error instanceof ApiError && error.status === 404))) {
    return <LoadError error={error} />;
  }
  return (
    <>
      <CampaignBoard view={view!} mode={{ kind: "public" }} />
      {ownJoin && (
        <NavPortal>
          <JoinButton campaign={{ id, name: view!.campaign.name }} />
        </NavPortal>
      )}
    </>
  );
}
