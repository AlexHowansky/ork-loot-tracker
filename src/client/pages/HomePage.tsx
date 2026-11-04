import { Link } from "react-router";
import { useMe } from "../queries.ts";
import { LoadError, Loading } from "../components/Layout.tsx";
import { CampaignCover } from "../components/CampaignCover.tsx";
import { Icon, faDragon, faEye } from "../components/Icon.tsx";
import { CampaignsPage } from "./CampaignsPage.tsx";
import { JoinForm } from "../components/JoinForm.tsx";

export function HomePage() {
  const { data: me, error, isPending } = useMe();
  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;
  if (me.gm) return <CampaignsPage />;

  if (me.characters.length === 0 && me.observers.length === 0) {
    return (
      <div className="card bg-base-100 shadow mx-auto mt-8 w-full max-w-md">
        <div className="card-body">
          <h1 className="card-title">
            <Icon icon={faDragon} className="text-primary" /> Welcome, adventurer
          </h1>
          <p className="text-base-content/70">
            Track your party's loot. Enter the join code your GM gave you for
            your character, or to observe a campaign.
          </p>
          <JoinForm />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Welcome, adventurer</h1>
          <p className="text-base-content/70">
            {me.observers.length === 0 ? "Choose a character to see their loot." : "Choose a character or a campaign you observe."}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {me.characters.map((c) => (
          <Link key={c.id} to={`/campaigns/${c.campaignId}`} className="card bg-base-100 shadow transition hover:shadow-lg">
            <CampaignCover image={c.campaignImage} />
            <div className="card-body p-4">
              <h2 className="card-title">{c.name}</h2>
              <p className="text-sm text-base-content/70">{c.campaignName}</p>
            </div>
          </Link>
        ))}
        {me.observers.map((o) => (
          <Link key={o.id} to={`/campaigns/${o.campaignId}`} className="card bg-base-100 shadow transition hover:shadow-lg">
            <CampaignCover image={o.campaignImage} />
            <div className="card-body p-4">
              <h2 className="card-title">{o.campaignName}</h2>
              <p className="text-sm text-base-content/70">
                <Icon icon={faEye} /> Observing as {o.name}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
