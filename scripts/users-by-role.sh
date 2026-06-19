#!/usr/bin/env bash
set -euo pipefail

# List the users holding a role in the shared `appdata` DB. Run on the VPS,
# where the `postgres` container lives (Postgres has no host port).
#
#   ./users-by-role.sh <role>
#   ./users-by-role.sh Sousakuten

ROLES=(IT Sousakuten Taiikusai)

die() {
  echo "error: $1" >&2
  echo "usage: $0 <role>   (roles: ${ROLES[*]})" >&2
  exit 2
}

[ "$#" -eq 1 ] || die "expected exactly one role"
role="$1"

printf '%s\n' "${ROLES[@]}" | grep -qxF "$role" || die "unknown role '$role'"

docker exec postgres psql -U postgres -d appdata -c \
  "SELECT username, roles FROM users WHERE '${role}' = ANY(roles) ORDER BY username;"
