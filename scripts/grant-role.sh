#!/usr/bin/env bash
set -euo pipefail

# Grant a role to one or more users in the shared `appdata` DB. Run on the VPS,
# where the `postgres` container lives (Postgres has no host port). Append-only
# and idempotent: existing roles are kept, and re-running is a no-op.
#
#   ./grant-role.sh <role> <username> [username...]
#   ./grant-role.sh Sousakuten 3B12 4A05 k0959176

ROLES=(IT Sousakuten Taiikusai G1 G2 G3 G4 G5 G6 ClassA ClassB ClassC ClassD Students Teachers SousakutenMain)

die() {
  echo "error: $1" >&2
  echo "usage: $0 <role> <username> [username...]   (roles: ${ROLES[*]})" >&2
  exit 2
}

[ "$#" -ge 2 ] || die "expected a role and at least one username"
role="$1"
shift

# Validate the role against the enum so a typo can't reach SQL.
printf '%s\n' "${ROLES[@]}" | grep -qxF "$role" || die "unknown role '$role'"

# Build a quoted, comma-separated username list. Reject anything that isn't a
# plain account id (class codes like 3B12, staff like k0959176) so a value can't
# break out of the SQL string.
list=""
for u in "$@"; do
  [[ "$u" =~ ^[A-Za-z0-9]+$ ]] || die "invalid username '$u'"
  list+="${list:+, }'${u}'"
done

docker exec postgres psql -U postgres -d appdata -c \
  "UPDATE users SET roles = array_append(roles, '${role}') WHERE username IN (${list}) AND NOT ('${role}' = ANY(roles));"

# Show the resulting rows so the grant is easy to eyeball.
docker exec postgres psql -U postgres -d appdata -c \
  "SELECT username, roles FROM users WHERE username IN (${list}) ORDER BY username;"
