import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../api.ts";
import { keys, splitPreviewKey, useCampaign, useMe, usePublic, useRefresh } from "../queries.ts";
import { useLiveUpdates } from "../live.ts";
import { CampaignBoard } from "../components/Board.tsx";
import { CampaignForm } from "../components/CampaignForm.tsx";
import { PublicCampaign } from "./PublicPage.tsx";
import { fromFragment, JoinForm, useJoin } from "../components/JoinForm.tsx";
import { PlayCampaign } from "./PlayPage.tsx";
import { WatchCampaign } from "./WatchPage.tsx";
import { Menu } from "../components/Menu.tsx";
import { SplitModal } from "../components/SplitModal.tsx";
import { GmsModal } from "../components/GmsModal.tsx";
import { LoadError, Loading } from "../components/Layout.tsx";
import { useConfirm } from "../components/Confirm.tsx";
import { useToast } from "../components/Toast.tsx";
import { formatMoney } from "../../shared/money.ts";
import {
  Icon,
  faChevronDown,
  faPen,
  faScaleBalanced,
  faTrash,
  faImage,
  faUserShield,
} from "../components/Icon.tsx";

/**
 * A campaign's one address, for everyone: its GM gets the GM's board, and
 * anyone else what `Visitor` decides.
 */
export function CampaignPage() {
  const id = useParams().id ?? "";
  const { data, error, isPending } = useCampaign(id);
  if (isPending) return <Loading />;
  // Not signed in as a GM (401), or not this campaign's GM (404).
  if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
    return <Visitor id={id} />;
  }
  if (!data) return <LoadError error={error} />;
  return <GmCampaign id={id} />;
}

/**
 * Anyone at a campaign's address who isn't its GM. A join code in the
 * fragment is redeemed for this campaign. A browser that holds a
 * character in it (or else an observer) sees the campaign as them;
 * otherwise a public campaign shows its public view, and a private one
 * the join code box.
 */
function Visitor({ id }: { id: string }) {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  // Read once: joining drops the code from the address, and the page must
  // keep it to show if the code fails.
  const [linkCode] = useState(() => fromFragment(hash).trim());
  const link = useJoin(id);
  // Strict Mode runs effects twice; a code must only be redeemed once.
  const linkTried = useRef(false);
  const me = useMe();
  const pub = usePublic(id);

  useEffect(() => {
    if (linkTried.current || !linkCode) return;
    linkTried.current = true;
    // Going back or reloading mustn't try a code that's now used up.
    navigate(pathname, { replace: true });
    void link.join(linkCode, true);
    // Only for the code the page was opened with.
  }, []);

  if (linkCode && !link.joined) {
    // Joining goes straight on to the character; the box shows only if
    // the code fails, with it filled in beside the reason.
    if (!link.error) return <Loading />;
    return (
      <>
        <JoinCard campaignId={id} code={linkCode} error={link.error} />
        {pub.data && <PublicCampaign id={id} />}
      </>
    );
  }
  if (me.isPending || pub.isPending) return <Loading />;
  // Should a browser hold more than one seat here, the one it just took
  // wins, then characters by name, then observers.
  const characters = me.data?.characters.filter((c) => c.campaignId === id) ?? [];
  const observers = me.data?.observers.filter((o) => o.campaignId === id) ?? [];
  const character = characters.find((c) => c.id === link.joined) ?? characters[0];
  const observer = observers.find((o) => o.id === link.joined) ?? observers[0];
  if (character && !(observer && observer.id === link.joined)) {
    return <PlayCampaign key={character.id} characterId={character.id} />;
  }
  if (observer) return <WatchCampaign key={observer.id} observerId={observer.id} />;
  if (pub.data) return <PublicCampaign id={id} />;
  return <JoinCard campaignId={id} />;
}

/**
 * The join code box for one campaign. It doesn't name the campaign: to
 * anyone without a code, a private one mustn't seem to exist.
 */
function JoinCard({
  campaignId,
  code,
  error,
}: {
  campaignId: string;
  /** A code from the link that failed, with `error` saying why. */
  code?: string;
  error?: unknown;
}) {
  return (
    <div className="card bg-base-100 shadow mx-auto my-8 w-full max-w-sm">
      <div className="card-body">
        <h1 className="card-title">Join a campaign</h1>
        <p className="text-sm text-base-content/70">
          {code
            ? "The code from your link didn't work."
            : "Enter the join code your GM gave you. If this campaign is yours, sign in to see it."}
        </p>
        <JoinForm campaignId={campaignId} initialCode={code} initialError={error} />
      </div>
    </div>
  );
}

function GmCampaign({ id }: { id: string }) {
  const { data: view, error, isPending } = useCampaign(id);
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [managingGms, setManagingGms] = useState(false);
  const refresh = useRefresh();
  const ask = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Set once this GM has left, so the stream ending doesn't say so twice.
  const left = useRef(false);

  /** Back to the campaign list, once this GM no longer runs the campaign. */
  async function lostAccess(message: string) {
    qc.removeQueries({ queryKey: keys.campaign(id) });
    await qc.invalidateQueries({ queryKey: keys.campaigns });
    navigate("/");
    toast(message, "info");
  }

  useLiveUpdates(`/api/campaigns/${id}/events`, [keys.campaign(id), splitPreviewKey(id)], () => {
    if (left.current) return;
    void lostAccess(`Another GM removed you from ${view?.campaign.name ?? "the campaign"}.`);
  });

  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;
  const { campaign } = view;

  async function removeImage() {
    const ok = await ask({
      title: "Remove the background image?",
      message: <p>The campaign keeps everything else.</p>,
      confirmLabel: "Remove image",
    });
    if (!ok) return;
    try {
      await api.del(`/api/campaigns/${campaign.id}/image`);
      toast("Image removed.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    refresh();
  }

  async function removeCampaign() {
    const ok = await ask({
      title: `Delete ${campaign.name}?`,
      message: (
        <p>
          Its characters, sessions, loot and split history are deleted for good. Players lose access.
        </p>
      ),
      confirmLabel: "Delete campaign",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/campaigns/${campaign.id}`);
      qc.removeQueries({ queryKey: keys.campaign(campaign.id) });
      await qc.invalidateQueries({ queryKey: keys.campaigns });
      toast(`Deleted ${campaign.name}.`);
      navigate("/");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <CampaignBoard
        view={view}
        mode={{ kind: "gm" }}
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSplitting(true)}>
              <Icon icon={faScaleBalanced} /> Loot split
            </button>
            <Menu
              label={
                <>
                  Campaign <Icon icon={faChevronDown} />
                </>
              }
            >
              <li>
                <button type="button" onClick={() => setEditing(true)}>
                  <Icon icon={faPen} /> Edit campaign
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setManagingGms(true)}>
                  <Icon icon={faUserShield} /> GMs
                </button>
              </li>
              {campaign.backgroundImage && (
                <li>
                  <button type="button" onClick={removeImage}>
                    <Icon icon={faImage} /> Remove image
                  </button>
                </li>
              )}
              <li>
                <button type="button" className="text-error" onClick={removeCampaign}>
                  <Icon icon={faTrash} /> Delete campaign
                </button>
              </li>
            </Menu>
          </>
        }
      />
      {editing && (
        <CampaignForm
          campaign={campaign}
          decimalsLocked={view.loot.length > 0 || view.cash.length > 0 || campaign.cash !== 0}
          debtLocked={view.characters.some((c) => c.debt > 0)}
          campaignUrl={view.campaignUrl}
          observerCount={view.observers?.length ?? 0}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {managingGms && (
        <GmsModal
          view={view}
          onClose={() => setManagingGms(false)}
          onChanged={refresh}
          onLeaving={(leaving) => (left.current = leaving)}
          onLeft={() => {
            setManagingGms(false);
            void lostAccess(`You left ${campaign.name}.`);
          }}
        />
      )}
      {splitting && (
        <SplitModal
          campaign={campaign}
          onClose={() => setSplitting(false)}
          onDone={(split) => {
            const money = (n: number) => formatMoney(n, campaign.currencyDecimals, campaign.currencyLabel);
            const change = split.leftover - split.cash;
            const cashNote =
              change > 0
                ? `, ${money(change)} added to cash`
                : change < 0
                  ? `, ${money(-change)} paid out of cash`
                  : "";
            toast(`Split done: ${money(split.total - split.leftover)} shared out${cashNote}.`);
            refresh();
          }}
        />
      )}
    </>
  );
}
