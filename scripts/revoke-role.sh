#!/usr/bin/env bash
set -euo pipefail

# Revoke a role from one or more users in the shared `appdata` DB. Run on the
# VPS, where the `postgres` container lives (Postgres has no host port). Other
# roles on each user are left untouched; re-running is a no-op.
#
#   ./revoke-role.sh <role> <username> [username...]
#   ./revoke-role.sh Sousakuten 3B12 4A05

ROLES=(IT Sousakuten Taiikusai)

die() {
  echo "error: $1" >&2
  echo "usage: $0 <role> <username> [username...]   (roles: ${ROLES[*]})" >&2
  exit 2
}

[ "$#" -ge 2 ] || die "expected a role and at least one username"
role="$1"
shift

printf '%s\n' "${ROLES[@]}" | grep -qxF "$role" || die "unknown role '$role'"

list=""
for u in "$@"; do
  [[ "$u" =~ ^[A-Za-z0-9]+$ ]] || die "invalid username '$u'"
  list+="${list:+, }'${u}'"
done

docker exec postgres psql -U postgres -d appdata -c \
  "UPDATE users SET roles = array_remove(roles, '${role}') WHERE username IN (${list});"

docker exec postgres psql -U postgres -d appdata -c \
  "SELECT username, roles FROM users WHERE username IN (${list}) ORDER BY username;"
