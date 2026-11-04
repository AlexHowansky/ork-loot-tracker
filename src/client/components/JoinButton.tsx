import { useState } from "react";
import { Icon, faKey } from "./Icon.tsx";
import { JoinForm } from "./JoinForm.tsx";
import { Modal } from "./Modal.tsx";

/**
 * The nav bar's Join button, opening the join code box in a modal. With
 * `campaign`, only that campaign's codes are taken. Joining opens the
 * code's campaign as the character or observer taken.
 */
export function JoinButton({ campaign }: { campaign?: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Icon icon={faKey} /> Join
      </button>
      {open && (
        <Modal
          title={campaign ? `Join ${campaign.name}` : "Join a campaign"}
          onClose={() => setOpen(false)}
          actions={null}
        >
          <div className="w-80 max-w-full">
            <p className="text-sm text-base-content/70">
              Enter the code your GM gave you for your character, or to observe the campaign.
            </p>
            <JoinForm campaignId={campaign?.id} onCancel={() => setOpen(false)} />
          </div>
        </Modal>
      )}
    </>
  );
}
