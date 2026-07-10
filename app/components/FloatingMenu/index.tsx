import Link from "next/link";

import type { Role } from "@/lib/access";

import { Internal } from "../Internal";
import styles from "./floating.module.css";
import { FloatingMenuShell } from "./FloatingMenuShell";

export type FloatingMenuItem = {
  label: string;
  href: string;
  /** Render only for logged-in internal (student / teacher) users. */
  isInternal?: boolean;
  /**
   * Narrow an internal entry to one or more roles. Only meaningful next to
   * `isInternal`, because <Internal> requires an internal account before it
   * considers roles at all.
   */
  role?: Role | Role[];
};

type FloatingMenuProps = {
  items: FloatingMenuItem[];
  collapseDelayMs?: number;
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
 * the browser ever learning what it was not allowed to see.
 *
 * An item hidden this way leaves no trace in the HTML; <Internal> renders null.
 * Every call site therefore wants at least one ungated entry, or a logged-out
 * visitor opens an empty menu.
 */
export function FloatingMenu({ items, collapseDelayMs }: FloatingMenuProps) {
  return (
    <FloatingMenuShell collapseDelayMs={collapseDelayMs}>
      {items.map((item) =>
        item.isInternal ? (
          <Internal key={item.href} role={item.role}>
            <FloatingMenuLink item={item} />
          </Internal>
        ) : (
          <FloatingMenuLink key={item.href} item={item} />
        ),
      )}
    </FloatingMenuShell>
  );
}
