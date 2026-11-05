import type { ReactNode } from "react";

export function SubmitButton({
  busy,
  children,
  className = "btn-primary",
  disabled,
}: {
  busy: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type="submit" className={`btn ${className}`} disabled={busy || disabled}>
      {busy && <span className="loading loading-spinner loading-sm" />}
      {children}
    </button>
  );
}

export function CancelButton({
  onClick,
  children = "Cancel",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="btn" onClick={onClick}>
      {children}
    </button>
  );
}
