import { useState } from "react";
import { api, errorMessage } from "../api.ts";
import type { CampaignView, GmView } from "../../shared/types.ts";
import { Field, FormError, withError } from "./Field.tsx";
import { Modal } from "./Modal.tsx";
import { CancelButton, SubmitButton } from "./SubmitButton.tsx";
import { useSubmit } from "./useSubmit.ts";
import { useConfirm } from "./Confirm.tsx";
import { useToast } from "./Toast.tsx";
import { Icon, faArrowRightFromBracket, faTrash } from "./Icon.tsx";

/**
 * Everyone who runs a campaign. Any of them can add another GM by email
 * address, or remove one, themselves included, as long as one is left.
 */
export function GmsModal({
  view,
  onClose,
  onChanged,
  onLeaving,
  onLeft,
}: {
  view: CampaignView;
  onClose: () => void;
  onChanged: () => void;
  /** Says this GM is (or, on failure, isn't after all) leaving. */
  onLeaving: (leaving: boolean) => void;
  /** Called once this GM has removed themselves from the campaign. */
  onLeft: () => void;
}) {
  const { campaign } = view;
  const gms = view.gms ?? [];
  const only = gms.length <= 1;
  const [email, setEmail] = useState("");
  const s = useSubmit();
  const ask = useConfirm();
  const toast = useToast();

  const add = () =>
    s.run(async () => {
      await api.post(`/api/campaigns/${campaign.id}/gms`, { email });
      toast(`${email.trim()} can now run ${campaign.name}.`);
      setEmail("");
      onChanged();
    });

  async function remove(g: GmView) {
    const ok = await ask(
      g.you
        ? {
            title: `Leave ${campaign.name}?`,
            message: <p>The other GMs keep running it. You lose access until one of them adds you again.</p>,
            confirmLabel: "Leave campaign",
            danger: true,
          }
        : {
            title: `Remove ${g.email}?`,
            message: <p>They lose access to {campaign.name} straight away.</p>,
            confirmLabel: "Remove GM",
            danger: true,
          },
    );
    if (!ok) return;
    // Their own stream ends as they leave; the page mustn't take that as
    // being removed by someone else.
    if (g.you) onLeaving(true);
    try {
      await api.del(`/api/campaigns/${campaign.id}/gms/${g.id}`);
      if (g.you) {
        onLeft();
        return;
      }
      toast(`Removed ${g.email}.`);
    } catch (err) {
      if (g.you) onLeaving(false);
      toast(errorMessage(err), "error");
    }
    onChanged();
  }

  return (
    <Modal
      title="GMs"
      onClose={onClose}
      onSubmit={add}
      actions={
        <>
          <CancelButton onClick={onClose}>Done</CancelButton>
          <SubmitButton busy={s.busy}>Add GM</SubmitButton>
        </>
      }
    >
      <div className="w-96 max-w-full">
        <p className="mb-2 text-sm text-base-content/70">
          Every GM here can do anything with the campaign, including adding and removing GMs.
        </p>
        <table className="table table-sm mb-4">
          <tbody>
            {gms.map((g) => (
              <tr key={g.id}>
                <td className="break-all">
                  {g.email}
                  {g.you && <span className="ms-2 badge badge-sm badge-ghost">you</span>}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square tooltip tooltip-left"
                    data-tip={only ? "A campaign needs at least one GM" : g.you ? "Leave campaign" : "Remove GM"}
                    aria-label={g.you ? "Leave campaign" : `Remove ${g.email}`}
                    disabled={only}
                    onClick={() => remove(g)}
                  >
                    <Icon icon={g.you ? faArrowRightFromBracket : faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormError message={s.hasFieldErrors ? null : s.message} />
        <Field label="Add a GM" error={s.fields.email} hint="The email address they sign in with. They need a GM account already.">
          <input
            type="email"
            className={withError("input w-full", s.fields.email)}
            data-autofocus
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
