import Link from "next/link";

import { INTERNAL_ROLES, type Role } from "@/lib/access";

import { Internal } from "../Internal";
import styles from "./floating.module.css";
import { FloatingMenuShell } from "./FloatingMenuShell";

// A discriminated union so `role` cannot be given without `isInternal: true`
// — the renderer only branches on `isInternal`, so a lone `role` would be
// silently ignored and the entry rendered publicly. The union turns that
// mistake into a compile error instead.
export type FloatingMenuItem =
  | {
      label: string;
      href: string;
      /** Public entry, shown to everyone; role gating requires `isInternal`. */
      isInternal?: false;
      role?: never;
    }
  | {
      label: string;
      href: string;
      /**
       * Render only for logged-in school accounts (see INTERNAL_ROLES), or —
       * when `role` is also given — only for those holding one of the roles.
       */
      isInternal: true;
      /**
       * Narrow an internal entry to one or more roles. Without it the entry
       * falls back to INTERNAL_ROLES (Students / Teachers).
       */
      role?: Role | readonly Role[];
    };

type FloatingMenuProps = {
  items: FloatingMenuItem[];
};

function FloatingMenuLink({ item }: { item: FloatingMenuItem }) {
  return (
    <Link href={item.href} className={styles.link}>
      {item.label}
    </Link>
  );
}

/**
 * Chooses which links exist, then hands them to the client shell as children.
 * Entries flagged `isInternal` are wrapped in <Internal>, which resolves the
 * shared session cookie on the server — so the menu follows login state without
 * the browser ever learning what it was not allowed to see. <Internal> is
 * deny-by-default, so the wrapper always passes a role: the item's own, or
 * INTERNAL_ROLES when the item names none.
 *
 * An item hidden this way leaves no trace in the HTML; <Internal> renders null.
 * Every call site therefore wants at least one ungated entry, or a logged-out
 * visitor opens an empty menu.
 */
export function FloatingMenu({ items }: FloatingMenuProps) {
  return (
    <FloatingMenuShell>
      {items.map((item) =>
        item.isInternal ? (
          <Internal key={item.href} role={item.role ?? INTERNAL_ROLES}>
            <FloatingMenuLink item={item} />
          </Internal>
        ) : (
          <FloatingMenuLink key={item.href} item={item} />
        ),
      )}
    </FloatingMenuShell>
  );
}
