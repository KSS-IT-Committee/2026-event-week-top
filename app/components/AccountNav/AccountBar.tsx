import { AccountNav } from ".";
import styles from "./AccountBar.module.css";

/**
 * Sticky top bar carrying the AccountNav, for apps that have no header of
 * their own (event-week-top, taiikusai-top). Apps with a header/nav render
 * <AccountNav /> inline there instead.
 */
export function AccountBar() {
  return (
    <div className={styles.bar}>
      <AccountNav />
    </div>
  );
}
