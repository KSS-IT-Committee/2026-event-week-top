import "server-only";

import type { Role } from "@/lib/access";

/**
 * Who may register 芸能祭 seats: the 芸能祭 committee, plus IT for support.
 * Named once so the two page guards and the server action that re-checks
 * every submission cannot drift apart.
 */
export const SEAT_ADMIN_ROLES: readonly Role[] = ["Geinousai", "IT"];
