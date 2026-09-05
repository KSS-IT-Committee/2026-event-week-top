#!/usr/bin/env bash
set -euo pipefail

# Reset one account's password in the shared `appdata` DB. Run on the VPS,
# where the `postgres` container lives (Postgres has no host port).
#
#   ./reset-password.sh <username>           # pick a new password and print it
#   ./reset-password.sh <username> --stdin   # type (or pipe in) the new password
#   ./reset-password.sh 3B12
#
# The hash comes from pgcrypto's crypt()/gen_salt('bf', 12) — the same $2a$
# bcrypt shape 2026-account-generator ships and what /login (bcryptjs)
# verifies. Like the app's own password change, this also deletes every
# session row for the account, so logins made with the old password die
# across all apps at once (`sessions` is shared). `has_logged_in` is left
# alone: it records that the account has ever been used and never goes back
# to false.

PASSWORD_LENGTH=8
# Alphabet from 2026-account-generator: A-Za-z0-9 minus the visually ambiguous
# Il1O0, since these passwords are read off a screen and typed by hand.
PASSWORD_CLASS='A-HJ-NP-Za-km-z2-9'
# /login's floor for a self-chosen password, and bcrypt's 72-byte input limit
# (anything past it is silently ignored, so accepting it would be a lie).
PASSWORD_MIN_LENGTH=8
PASSWORD_MAX_BYTES=72

die() {
  echo "error: $1" >&2
  echo "usage: $0 <username> [--stdin]" >&2
  exit 2
}

fail() {
  echo "error: $1" >&2
  exit 1
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die "expected a username"
username="$1"
# Only plain account ids (class codes like 3B12, staff like k0959176) — this is
# what keeps the username from breaking out of the SQL string below.
[[ "$username" =~ ^[A-Za-z0-9]+$ ]] || die "invalid username '$username'"

case "${2-}" in
"") is_generated=true ;;
--stdin) is_generated=false ;;
*) die "unknown option '$2'" ;;
esac

if $is_generated; then
  # 4096 random bytes leave far more than 8 usable characters after the
  # filter; the length check turns a short read into an error instead of a
  # short password.
  password=$(LC_ALL=C head -c 4096 /dev/urandom |
    LC_ALL=C tr -dc "$PASSWORD_CLASS" |
    cut -c "1-${PASSWORD_LENGTH}")
  [ "${#password}" -eq "$PASSWORD_LENGTH" ] || fail "could not generate a password"
else
  if [ -t 0 ]; then
    # Ask twice: a typo here locks the account's owner out.
    read -rsp "new password: " password && echo
    read -rsp "retype: " confirm && echo
    [ "$password" = "$confirm" ] || die "passwords do not match"
  else
    IFS= read -r password || die "no password on stdin"
  fi
  [ "${#password}" -ge "$PASSWORD_MIN_LENGTH" ] ||
    die "password must be at least ${PASSWORD_MIN_LENGTH} characters"
  [ "$(printf '%s' "$password" | LC_ALL=C wc -c)" -le "$PASSWORD_MAX_BYTES" ] ||
    die "password must be at most ${PASSWORD_MAX_BYTES} bytes"
fi

# Double every single quote so the password cannot break out of the SQL
# literal. standard_conforming_strings is on, so backslashes stay literal and
# need no escaping.
escaped=${password//\'/\'\'}

# crypt()/gen_salt() live in pgcrypto; create-user.sh installs it the same
# way. `client_min_messages` mutes the NOTICE on the (normal) already-there
# case without hiding real errors.
docker exec postgres psql -U postgres -d appdata -qtAXc \
  "SET client_min_messages TO warning; CREATE EXTENSION IF NOT EXISTS pgcrypto;" \
  >/dev/null

# The statement goes in on stdin, never in argv: `psql -c "<password>"` would
# show the new password to anyone running `ps` on the box. One data-modifying
# CTE keeps the rehash and the session revocation in a single statement, so a
# failure can't leave the new password active with old sessions still valid.
result=$(docker exec -i postgres psql -U postgres -d appdata -qtAX \
  -v ON_ERROR_STOP=1 -f - <<SQL
WITH updated AS (
  UPDATE users
     SET password_hash = crypt('${escaped}', gen_salt('bf', 12))
   WHERE username = '${username}'
  RETURNING username
), revoked AS (
  DELETE FROM sessions
   WHERE username IN (SELECT username FROM updated)
  RETURNING id
)
SELECT (SELECT count(*) FROM updated), (SELECT count(*) FROM revoked);
SQL
)

updated=${result%%|*}
revoked=${result##*|}
[ "$updated" = "1" ] || fail "no such user '${username}' — nothing was changed"

echo "${username}: password reset, ${revoked} session(s) revoked"
if $is_generated; then
  echo "new password: ${password}"
fi
