import { getCurrentUser } from "@/lib/session";
import { getLoginBaseUrl } from "@/lib/session-cookie";

import { AccountNavLink } from "./AccountNavLink";

/**
 * Login entry point shown in each app's chrome. Reads the shared session
 * server-side and hands the username (or null) to the client link, which
 * appends the return URL. Reading the session makes the surrounding route
 * render dynamically — intended, since the control is per-user.
 *
 * This component folder is byte-identical across the four app repos.
 */
export async function AccountNav() {
  const user = await getCurrentUser();
  return (
    <AccountNavLink
      username={user?.username ?? null}
      loginBaseUrl={getLoginBaseUrl()}
    />
  );
}
