import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Where a page may put its own controls in the nav bar. */
export const NavSlotContext = createContext<HTMLElement | null>(null);

/** Shows its children in the nav bar while the page using it is open. */
export function NavPortal({ children }: { children: ReactNode }) {
  const slot = useContext(NavSlotContext);
  return slot ? createPortal(children, slot) : null;
}
